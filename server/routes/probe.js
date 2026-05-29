const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const db = require('../db');

/**
 * Probe endpoint - detects stream codecs and container
 * GET /api/probe?url=...
 * 
 * Returns:
 * {
 *   video: "h264",
 *   audio: "aac",
 *   container: "mpegts",
 *   compatible: true,
 *   needsRemux: false,
 *   needsTranscode: false
 * }
 */

// Probe cache (URL → result)
const probeCache = new Map();
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PROBE_SIZE = process.env.PROBE_SIZE || '2000000';
const PROBE_ANALYZE_DURATION = process.env.PROBE_ANALYZE_DURATION || '2000000';
const PROBE_TIMEOUT_MS = readPositiveNumberEnv('PROBE_TIMEOUT_MS', 7000);
const RANGE_CHECK_TIMEOUT_MS = readPositiveNumberEnv('PROBE_RANGE_TIMEOUT_MS', 3000);

// Browser-compatible codecs
const BROWSER_VIDEO_CODECS = ['h264', 'avc', 'avc1'];
const BROWSER_AUDIO_CODECS = ['aac', 'mp3', 'opus', 'vorbis'];
const HEVC_VIDEO_MARKERS = ['hevc', 'h265', 'h.265', 'hev1', 'hvc1'];

function readPositiveNumberEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveUserAgent(ua, settings = {}) {
    if (ua && db.USER_AGENT_PRESETS?.[ua]) {
        return db.USER_AGENT_PRESETS[ua];
    }
    if (ua && String(ua).trim()) {
        return ua;
    }
    return db.getUserAgent(settings);
}

function codecSignature(...values) {
    return values
        .filter(v => v !== null && v !== undefined)
        .map(v => String(v).toLowerCase())
        .join(' ');
}

function isHevcVideoCodec(...values) {
    const signature = codecSignature(...values);
    return HEVC_VIDEO_MARKERS.some(marker => signature.includes(marker));
}

async function checkRangeSeekable(url, userAgent) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), RANGE_CHECK_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: ac.signal,
            headers: {
                'User-Agent': userAgent || 'Mozilla/5.0',
                'Range': 'bytes=0-1',
                'Accept': '*/*'
            }
        });
        const contentRange = response.headers.get('content-range');
        const acceptRanges = response.headers.get('accept-ranges');
        const contentType = response.headers.get('content-type') || null;
        const contentLength = response.headers.get('content-length') || null;
        const seekable = response.status === 206 || !!contentRange || acceptRanges === 'bytes';
        return {
            seekable,
            contentType,
            contentLength,
            acceptRanges,
            contentRange,
            rangeStatus: response.status
        };
    } catch {
        return {
            seekable: false,
            contentType: null,
            contentLength: null,
            acceptRanges: null,
            contentRange: null,
            rangeStatus: null
        };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Probe stream with ffprobe
 */
function probeStream(url, ffprobePath, userAgent = null, timeout = PROBE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const args = [
            '-v', 'error',
            '-user_agent', userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            '-print_format', 'json',
            '-show_streams',
            '-show_format',
            '-probesize', PROBE_SIZE,
            '-analyzeduration', PROBE_ANALYZE_DURATION,
            url
        ];

        const proc = spawn(ffprobePath, args);
        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error('Probe timeout'));
        }, timeout);

        proc.stdout.on('data', (data) => { stdout += data; });
        proc.stderr.on('data', (data) => { stderr += data; });

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
                return;
            }
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (e) {
                reject(new Error('Failed to parse ffprobe output'));
            }
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

/**
 * Analyze probe result and determine compatibility
 */
function analyzeProbeResult(probeResult, url, rangeInfo = {}) {
    const streams = probeResult.streams || [];
    const format = probeResult.format || {};

    const videoStream = streams.find(s => s.codec_type === 'video');
    const audioStream = streams.find(s => s.codec_type === 'audio');

    const rawVideoCodec = videoStream?.codec_name?.toLowerCase() || 'unknown';
    const videoCodecTag = videoStream?.codec_tag_string?.toLowerCase() || '';
    const videoCodecLongName = videoStream?.codec_long_name?.toLowerCase() || '';
    const videoCodec = rawVideoCodec === 'unknown' && isHevcVideoCodec(videoCodecTag, videoCodecLongName)
        ? 'hevc'
        : rawVideoCodec;
    const audioCodec = audioStream?.codec_name?.toLowerCase() || 'unknown';
    const container = format.format_name?.toLowerCase() || 'unknown';
    const isHevcVideo = isHevcVideoCodec(videoCodec, videoCodecTag, videoCodecLongName);

    // Check codec compatibility
    const videoOk = !isHevcVideo && BROWSER_VIDEO_CODECS.some(c => videoCodec.includes(c));
    const audioOk = BROWSER_AUDIO_CODECS.some(c => audioCodec.includes(c));

    // Browser-safe containers
    // Note: We exclude 'webm' because ffprobe reports MKV as "matroska,webm", 
    // and H.264/AAC in MKV/WebM is not universally supported. Best to remux to MP4.
    const BROWSER_CONTAINERS = ['hls', 'mp4', 'mov'];
    const containerOk = BROWSER_CONTAINERS.some(c => container.includes(c));

    // Check if it's a raw TS stream (not HLS)
    const isRawTs = (container.includes('mpegts') || url.endsWith('.ts')) && !url.includes('.m3u8');

    // Extract subtitle tracks
    const subtitles = streams
        .filter(s => s.codec_type === 'subtitle' && s.codec_name !== 'timed_id3' && s.codec_name !== 'bin_data')
        .map(s => ({
            index: s.index,
            language: s.tags?.language || 'und',
            title: s.tags?.title || s.tags?.language || `Track ${s.index}`,
            codec: s.codec_name
        }));

    // Determine what processing is needed
    // 4. MKV files often cause OOM/decoding issues in browser fMP4 remux, 
    // so we force them to "needsTranscode" which uses HLS (more robust).
    // The frontend will still use "copy" mode if codecs are compatible.
    const isMkv = container.includes('matroska') || container.includes('webm') || url.endsWith('.mkv');

    // 1. Incompatible audio/video OR MKV -> Transcode (or HLS Copy)
    const needsTranscode = isHevcVideo || !audioOk || !videoOk || isMkv;

    // 2. Compatible audio/video but incompatible container (non-MKV) -> Remux (fMP4 pipe)
    const needsRemux = !needsTranscode && (!containerOk || isRawTs);

    const compatible = !needsTranscode && !needsRemux;

    return {
        video: videoCodec,
        videoCodecTag,
        videoCodecLongName,
        isHevcVideo,
        audio: audioCodec,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        audioChannels: audioStream?.channels || 0, // For Smart Audio Copy
        container: container,
        durationSeconds: parseInt(format.duration, 10) || null,
        seekable: !!rangeInfo.seekable,
        contentType: rangeInfo.contentType || null,
        contentLength: rangeInfo.contentLength || null,
        acceptRanges: rangeInfo.acceptRanges || null,
        contentRange: rangeInfo.contentRange || null,
        rangeStatus: rangeInfo.rangeStatus ?? null,
        compatible: compatible,
        needsRemux: needsRemux,
        needsTranscode: needsTranscode,
        subtitles: subtitles
    };
}

router.get('/', async (req, res) => {
    const { url, ua } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    const ffprobePath = req.app.locals.ffprobePath;
    let settings = {};
    try {
        settings = await db.settings.get();
    } catch (err) {
        console.warn('[Probe] Failed to load settings, using defaults:', err.message);
    }
    const userAgent = resolveUserAgent(ua, settings);
    const cacheTtlSeconds = Number(settings.probeCacheTTL);
    const cacheTtlMs = Number.isFinite(cacheTtlSeconds) && cacheTtlSeconds > 0
        ? cacheTtlSeconds * 1000
        : DEFAULT_CACHE_TTL_MS;
    const cacheKey = `${url}${ua ? `|${ua}` : ''}`;

    if (!ffprobePath) {
        // No ffprobe available - assume needs transcoding to be safe
        console.log('[Probe] FFprobe not available, assuming transcode needed');
        return res.json({
            video: 'unknown',
            audio: 'unknown',
            container: 'unknown',
            compatible: false,
            needsRemux: false,
            needsTranscode: true
        });
    }

    // Check cache
    const cached = probeCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < cacheTtlMs)) {
        console.log(`[Probe] Cache hit for: ${url.substring(0, 50)}...`);
        return res.json(cached.result);
    }

    console.log(`[Probe] Probing: ${url.substring(0, 80)}... ${ua ? `(UA: ${ua})` : ''}`);

    try {
        const [probeResult, rangeInfo] = await Promise.all([
            probeStream(url, ffprobePath, userAgent),
            checkRangeSeekable(url, userAgent)
        ]);
        const analysis = analyzeProbeResult(probeResult, url, rangeInfo);

        // Cache result
        probeCache.set(cacheKey, { result: analysis, timestamp: Date.now() });

        console.log(`[Probe] Result: video=${analysis.video}, audio=${analysis.audio}, ` +
            `container=${analysis.container}, compatible=${analysis.compatible}, ` +
            `needsRemux=${analysis.needsRemux}, needsTranscode=${analysis.needsTranscode}`);

        res.json(analysis);
    } catch (err) {
        console.error('[Probe] Failed:', err.message);

        // On error, assume transcode needed to be safe
        res.json({
            video: 'unknown',
            audio: 'unknown',
            container: 'unknown',
            compatible: false,
            needsRemux: false,
            needsTranscode: true,
            error: err.message
        });
    }
});

module.exports = router;
