const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const db = require('../db');
const transcodeSession = require('../services/transcodeSession');
const DURATION_CACHE_TTL_MS = 15 * 60 * 1000;
const durationCache = new Map();
const durationProbePromises = new Map();
const ENCODER_FAILURE_COOLDOWN_MS = (() => {
    const value = Number(process.env.TRANSCODE_ENCODER_FAILURE_COOLDOWN_MS);
    return Number.isFinite(value) && value > 0 ? value : 10 * 60 * 1000;
})();
const encoderFailureUntil = new Map();

function resolveSelectedEncoder(settings, detectedEncoder) {
    const hardwareMode = settings.transcodeHardwareMode || 'auto';
    const configuredEncoder = settings.hwEncoder || 'auto';

    if (hardwareMode === 'software') {
        return { hardwareMode, selectedEncoder: 'software' };
    }

    if (hardwareMode === 'hardware') {
        if (configuredEncoder && configuredEncoder !== 'auto' && configuredEncoder !== 'software') {
            return { hardwareMode, selectedEncoder: configuredEncoder };
        }
        return { hardwareMode, selectedEncoder: detectedEncoder || 'software' };
    }

    // auto
    if (configuredEncoder && configuredEncoder !== 'auto') {
        return { hardwareMode, selectedEncoder: configuredEncoder };
    }
    return { hardwareMode, selectedEncoder: detectedEncoder || 'software' };
}

function parseDurationToSeconds(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }

    const str = String(value).trim().toLowerCase();
    if (!str) return null;

    if (/^\d+(\.\d+)?$/.test(str)) {
        return Math.max(0, Math.floor(Number(str)));
    }

    const clock = str.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (clock) {
        const a = Number(clock[1]);
        const b = Number(clock[2]);
        const c = clock[3] !== undefined ? Number(clock[3]) : 0;
        const seconds = clock[3] !== undefined ? (a * 3600) + (b * 60) + c : (a * 60) + b;
        return Math.max(0, Math.floor(seconds));
    }

    const unitMatch = str.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?/);
    if (unitMatch && (unitMatch[1] || unitMatch[2] || unitMatch[3])) {
        const h = Number(unitMatch[1] || 0);
        const m = Number(unitMatch[2] || 0);
        const s = Number(unitMatch[3] || 0);
        return (h * 3600) + (m * 60) + s;
    }

    return null;
}

function tryExtractDurationFromMetadata(metadata = {}) {
    const candidates = [
        metadata.duration,
        metadata.runtime,
        metadata.movie_duration,
        metadata.episode_run_time,
        metadata.info?.duration,
        metadata.info?.runtime,
        metadata.movie_data?.duration,
        metadata.movie_data?.runtime,
        metadata.episode?.duration,
        metadata.episode?.runtime
    ];

    for (const candidate of candidates) {
        const parsed = parseDurationToSeconds(candidate);
        if (parsed !== null) return parsed;
    }
    return null;
}

async function probeDurationSeconds(url, ffprobePath, userAgent) {
    if (!ffprobePath) return null;

    return new Promise((resolve) => {
        const args = [
            '-v', 'error',
            '-user_agent', userAgent || 'Mozilla/5.0',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            url
        ];
        const proc = spawn(ffprobePath, args);
        let stdout = '';

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve(null);
        }, 15000);

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.on('close', () => {
            clearTimeout(timer);
            try {
                const parsed = JSON.parse(stdout || '{}');
                const formatDuration = parseDurationToSeconds(parsed?.format?.duration);
                if (formatDuration !== null) return resolve(formatDuration);

                const streamDurations = (parsed?.streams || [])
                    .map(s => parseDurationToSeconds(s.duration))
                    .filter(v => v !== null);
                if (streamDurations.length > 0) {
                    return resolve(Math.max(...streamDurations));
                }
            } catch (_) {
                // ignore parse errors
            }
            resolve(null);
        });
        proc.on('error', () => {
            clearTimeout(timer);
            resolve(null);
        });
    });
}

async function getDurationSeconds(url, ffprobePath, userAgent, metadata = {}) {
    const metadataDuration = tryExtractDurationFromMetadata(metadata);
    if (metadataDuration !== null) return metadataDuration;

    const cached = durationCache.get(url);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < DURATION_CACHE_TTL_MS) {
        return cached.value;
    }

    const probed = await probeDurationSeconds(url, ffprobePath, userAgent);
    durationCache.set(url, { value: probed, timestamp: now });
    return probed;
}

function getKnownDurationSeconds(url, metadata = {}) {
    const metadataDuration = tryExtractDurationFromMetadata(metadata);
    if (metadataDuration !== null) return { value: metadataDuration, pending: false };

    const cached = durationCache.get(url);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < DURATION_CACHE_TTL_MS) {
        return { value: cached.value, pending: false };
    }

    return { value: null, pending: true };
}

function warmDurationCache(url, ffprobePath, userAgent) {
    if (!ffprobePath || durationProbePromises.has(url)) return;

    const promise = probeDurationSeconds(url, ffprobePath, userAgent)
        .then((value) => {
            durationCache.set(url, { value, timestamp: Date.now() });
            return value;
        })
        .catch(() => null)
        .finally(() => {
            durationProbePromises.delete(url);
        });

    durationProbePromises.set(url, promise);
}

function isEncoderInCooldown(encoder) {
    const until = encoderFailureUntil.get(encoder);
    if (!until) return false;
    if (Date.now() < until) return true;
    encoderFailureUntil.delete(encoder);
    return false;
}

function markEncoderFailure(encoder) {
    if (!encoder || encoder === 'software') return;
    encoderFailureUntil.set(encoder, Date.now() + ENCODER_FAILURE_COOLDOWN_MS);
}

/**
 * Transcode Routes
 * 
 * Direct streaming (backward compatible):
 *   GET /api/transcode?url=...
 * 
 * HLS session-based (new, supports seeking):
 *   POST /api/transcode/session        - Create new session
 *   GET  /api/transcode/:id/stream.m3u8 - Get HLS playlist
 *   GET  /api/transcode/:id/:segment.ts - Get segment file
 *   DELETE /api/transcode/:id          - Stop and cleanup session
 *   GET /api/transcode/sessions        - List all sessions (debug)
 */

// Start session cleanup interval
transcodeSession.startCleanupInterval();

/**
 * Create a new transcode session
 * POST /api/transcode/session
 * Body: { url: string, seekOffset?: number }
 */
router.post('/session', async (req, res) => {
    const {
        url,
        seekOffset,
        startAt,
        mode,
        metadata,
        videoMode,
        videoCodec,
        audioCodec,
        audioChannels
    } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const ffmpegPath = req.app.locals.ffmpegPath || 'ffmpeg';
    const ffprobePath = req.app.locals.ffprobePath;
    const settings = await db.settings.get();
    const userAgent = db.getUserAgent(settings);
    const hwDetect = require('../services/hwDetect');
    const hwCaps = hwDetect.getCapabilities() || await hwDetect.detect();
    const detectedEncoder = hwCaps?.recommended || 'software';
    const { hardwareMode, selectedEncoder: preferredEncoder } = resolveSelectedEncoder(settings, detectedEncoder);
    const effectiveSeekOffset = Number.isFinite(Number(startAt))
        ? Math.max(0, Number(startAt))
        : Math.max(0, Number(seekOffset) || 0);
    const normalizedMode = String(mode || '').toLowerCase();
    const isVodMode = ['vod', 'movie', 'series', 'episode'].includes(normalizedMode);

    try {
        const baseSessionOptions = {
            ffmpegPath,
            userAgent,
            seekOffset: effectiveSeekOffset,
            maxResolution: settings.maxResolution || '1080p',
            quality: settings.quality || 'medium',
            audioMixPreset: settings.audioMixPreset || 'auto',
            upscaleEnabled: settings.upscaleEnabled || false,
            upscaleMethod: settings.upscaleMethod || 'hardware',
            upscaleTarget: settings.upscaleTarget || '1080p',
            mode: normalizedMode || 'unknown',
            videoMode: videoMode,
            videoCodec: videoCodec,
            audioCodec: audioCodec,
            audioChannels: audioChannels
        };

        const startSessionWithEncoder = async (encoder) => {
            const session = await transcodeSession.createSession(url, {
                ...baseSessionOptions,
                hwEncoder: encoder
            });
            try {
                await session.start();
                const minInitialSegments = isVodMode
                    ? transcodeSession.INITIAL_VOD_SEGMENTS
                    : transcodeSession.INITIAL_LIVE_SEGMENTS;
                const ready = await session.waitForPlaylist(15000, minInitialSegments);
                if (!ready) throw new Error('Playlist not generated in time');
                return session;
            } catch (err) {
                await transcodeSession.removeSession(session.id).catch(() => { });
                throw err;
            }
        };

        let didFallbackToSoftware = false;
        let selectedEncoder = isEncoderInCooldown(preferredEncoder) ? 'software' : preferredEncoder;
        const skippedEncoder = selectedEncoder === 'software' && preferredEncoder !== 'software' ? preferredEncoder : null;
        let ffmpegExitCode = null;
        let session;

        try {
            session = await startSessionWithEncoder(selectedEncoder);
        } catch (err) {
            const exitMatch = String(err.message || '').match(/code\s+(\d+)/i);
            ffmpegExitCode = exitMatch ? Number(exitMatch[1]) : null;

            if (selectedEncoder !== 'software') {
                console.warn('[Transcode] Hardware transcode failed, retrying with software encoder');
                markEncoderFailure(selectedEncoder);
                didFallbackToSoftware = true;
                selectedEncoder = 'software';
                session = await startSessionWithEncoder('software');
            } else {
                throw err;
            }
        }

        const durationInfo = isVodMode
            ? getKnownDurationSeconds(url, metadata || {})
            : { value: null, pending: false };

        if (isVodMode && durationInfo.pending) {
            warmDurationCache(url, ffprobePath, userAgent);
        }

        res.json({
            sessionId: session.id,
            playlistUrl: `/api/transcode/${session.id}/stream.m3u8`,
            status: session.status,
            startAt: effectiveSeekOffset,
            seekOffset: effectiveSeekOffset,
            durationSeconds: durationInfo.value ?? null,
            durationPending: !!durationInfo.pending,
            seekable: !!isVodMode,
            mode: normalizedMode || 'unknown',
            hardwareMode,
            detectedEncoder,
            selectedEncoder,
            skippedEncoder,
            didFallbackToSoftware,
            ffmpegExitCode
        });

    } catch (err) {
        console.error('[Transcode] Session creation failed:', err);
        res.status(500).json({ error: 'Failed to create session', details: err.message });
    }
});

/**
 * Get HLS playlist for a session
 * GET /api/transcode/:sessionId/stream.m3u8
 */
router.get('/:sessionId/stream.m3u8', async (req, res) => {
    const { sessionId } = req.params;
    const session = transcodeSession.getSession(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const playlist = await session.getPlaylist();
    if (!playlist) {
        return res.status(404).json({ error: 'Playlist not ready' });
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(playlist);
});

/**
 * Get a segment file for a session
 * GET /api/transcode/:sessionId/:segment.ts
 */
router.get('/:sessionId/:segment', async (req, res) => {
    const { sessionId, segment } = req.params;

    // Only handle .ts files
    if (!segment.endsWith('.ts')) {
        return res.status(404).json({ error: 'Invalid segment' });
    }

    const session = transcodeSession.getSession(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const segmentPath = await session.waitForSegment(segment);
    if (!segmentPath) {
        return res.status(404).json({ error: 'Segment not found' });
    }

    res.setHeader('Content-Type', 'video/MP2T');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache forever (immutable)
    res.sendFile(segmentPath);
});

/**
 * Stop and cleanup a session
 * DELETE /api/transcode/:sessionId
 */
router.delete('/:sessionId', async (req, res) => {
    const { sessionId } = req.params;

    try {
        await transcodeSession.removeSession(sessionId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove session', details: err.message });
    }
});

/**
 * List all active sessions (for debugging)
 * GET /api/transcode/sessions
 */
router.get('/sessions', (req, res) => {
    res.json(transcodeSession.getAllSessions());
});

/**
 * Direct transcode stream (backward compatible, no seeking)
 * GET /api/transcode?url=...
 * 
 * Transcodes audio to AAC for browser compatibility while passing video through.
 * This fixes playback issues with Dolby/AC3/EAC3 audio that browsers can't decode.
 */
router.get('/', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    const ffmpegPath = req.app.locals.ffmpegPath || 'ffmpeg';

    // Get User-Agent from settings
    const settings = await db.settings.get();
    const userAgent = db.getUserAgent(settings);

    console.log(`[Transcode] Starting transcoding for: ${url}`);
    console.log(`[Transcode] Using User-Agent: ${settings.userAgentPreset}`);
    console.log(`[Transcode] Using binary: ${ffmpegPath}`);

    // FFmpeg arguments for transcoding
    // Optimized for VOD content with incompatible audio (Dolby/AC3/EAC3)
    // Also works for live streams with ad stitching (Pluto TV, etc.)
    const args = [
        '-hide_banner',
        '-loglevel', 'warning',
        '-user_agent', userAgent,
        // Faster startup - reduced probe/analyze for quicker first bytes
        '-probesize', '2000000', // 2MB (reduced from 5MB)
        '-analyzeduration', '3000000', // 3 seconds (reduced from 10s)
        // Error resilience: generate timestamps, discard corrupt packets
        '-fflags', '+genpts+discardcorrupt+nobuffer',
        // Ignore errors in stream and continue
        '-err_detect', 'ignore_err',
        // Limit max demux delay to prevent buffering issues
        '-max_delay', '2000000',
        // Reconnect settings for network drops (useful for live streams)
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '3',
        // Prevent Range/HEAD requests that some providers reject with 405
        '-seekable', '0',
        '-i', url,
        // Map only first video and audio stream (avoid subtitle streams causing issues)
        '-map', '0:v:0',
        '-map', '0:a:0?', // ? makes audio optional if not present
        // Video: passthrough (no re-encoding = fast!)
        '-c:v', 'copy',
        // Audio: Transcode to browser-compatible AAC
        '-c:a', 'aac',
        '-ar', '48000',
        '-b:a', '192k',
        // Handle async audio/video using async filter
        '-af', 'aresample=async=1:min_hard_comp=0.100000:first_pts=0',
        // Timestamp handling
        '-fps_mode', 'passthrough',
        '-async', '1',
        '-max_muxing_queue_size', '2048',
        // Fragmented MP4 for streaming (browser-compatible)
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+faststart',
        '-flush_packets', '1', // Send data immediately
        '-' // Output to stdout
    ];

    console.log(`[Transcode] Full command: ${ffmpegPath} ${args.join(' ')}`);

    let ffmpeg;
    try {
        ffmpeg = spawn(ffmpegPath, args);
    } catch (spawnErr) {
        console.error('[Transcode] Failed to spawn FFmpeg:', spawnErr);
        return res.status(500).json({ error: 'FFmpeg spawn failed', details: spawnErr.message });
    }

    // Collect stderr for error reporting
    let stderrBuffer = '';

    // Set headers for fragmented MP4
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Pipe stdout to response
    ffmpeg.stdout.pipe(res);

    // Log stderr (useful for debugging transcoding failures)
    ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        stderrBuffer += msg;
        console.log(`[FFmpeg] ${msg}`);
    });

    // Cleanup on client disconnect
    req.on('close', () => {
        console.log('[Transcode] Client disconnected, killing FFmpeg process');
        ffmpeg.kill('SIGKILL');
    });

    // Handle process exit
    ffmpeg.on('exit', (code) => {
        if (code !== null && code !== 0 && code !== 255) { // 255 is often returned on kill
            console.error(`[Transcode] FFmpeg exited with code ${code}`);
        }
    });

    // Handle spawn errors
    ffmpeg.on('error', (err) => {
        console.error('[Transcode] Failed to spawn FFmpeg:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Transcoding failed to start' });
        }
    });
});

module.exports = router;
