const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const router = express.Router();

const ACTIVE_WINDOW_MS = 45 * 1000;
const WATCHING_WINDOW_MS = 45 * 1000;
const MAX_STRING_LENGTH = 260;
const MAX_EVENTS_FOR_SUMMARY = 50000;
const liveSessions = new Map();
let appendQueue = Promise.resolve();

function analyticsDir() {
    return process.env.NODECAST_ANALYTICS_DIR || path.join(__dirname, '..', '..', 'data', 'analytics');
}

function normalizeIp(raw) {
    const value = String(raw || '').trim();
    return value.startsWith('::ffff:') ? value.slice(7) : value;
}

function clientIp(req) {
    const cf = normalizeIp(req.get('cf-connecting-ip'));
    if (cf) return cf;
    const xff = req.get('x-forwarded-for');
    if (xff) return normalizeIp((xff.split(',')[0] || '').trim());
    const real = normalizeIp(req.get('x-real-ip'));
    if (real) return real;
    return normalizeIp(req.ip || req.socket?.remoteAddress || '0.0.0.0');
}

function isLocalHostName(value) {
    const host = String(value || '').split(':')[0].trim().toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function isLocalIp(value) {
    const ip = normalizeIp(value);
    return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function shouldIgnoreLocalAnalytics(req) {
    if (process.env.NODECAST_ANALYTICS_ALLOW_LOCAL === '1') return false;
    return isLocalHostName(req.hostname)
        || isLocalHostName(req.get('host'))
        || isLocalIp(clientIp(req));
}

function isLocalEvent(event) {
    return isLocalIp(event?.ip)
        || isLocalHostName(event?.host)
        || isLocalHostName(event?.origin)
        || /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?\b/i.test(String(event?.referrer || ''));
}

function headerValue(req, name) {
    const value = req.get(name);
    return typeof value === 'string' ? value.trim() : '';
}

function getAdminAccessKey() {
    return (process.env.ADMIN_ACCESS_KEY || process.env.VELORA_ADMIN_ACCESS_KEY || process.env.VITE_ADMIN_ACCESS_KEY || '').trim();
}

function verifyAdminAccess(req) {
    const configured = getAdminAccessKey();
    if (!configured) return true;

    const auth = headerValue(req, 'authorization');
    const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() || '';
    const sent = headerValue(req, 'x-velora-admin-access') || headerValue(req, 'x-admin-access') || bearer;
    if (!sent) return false;

    try {
        const a = Buffer.from(configured, 'utf8');
        const b = Buffer.from(sent, 'utf8');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

function requireAdmin(req, res, next) {
    if (verifyAdminAccess(req)) {
        next();
        return;
    }
    res.status(401).json({ error: 'Unauthorized' });
}

function cleanString(value, max = MAX_STRING_LENGTH) {
    if (value === null || value === undefined) return undefined;
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (!text) return undefined;
    return text.slice(0, max);
}

function cleanNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function cleanObject(value, depth = 0) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 1) return {};
    const out = {};
    for (const [key, raw] of Object.entries(value).slice(0, 40)) {
        const cleanKey = cleanString(key, 80);
        if (!cleanKey) continue;
        if (typeof raw === 'number') {
            const n = cleanNumber(raw);
            if (n !== undefined) out[cleanKey] = n;
        } else if (typeof raw === 'boolean') {
            out[cleanKey] = raw;
        } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            out[cleanKey] = cleanObject(raw, depth + 1);
        } else {
            const text = cleanString(raw);
            if (text !== undefined) out[cleanKey] = text;
        }
    }
    return out;
}

function eventFilePath(date = new Date()) {
    const day = date.toISOString().slice(0, 10);
    return path.join(analyticsDir(), `events-${day}.jsonl`);
}

async function appendEvent(event) {
    appendQueue = appendQueue.then(async () => {
        await fs.mkdir(analyticsDir(), { recursive: true });
        await fs.appendFile(eventFilePath(), `${JSON.stringify(event)}\n`, 'utf8');
    }).catch((err) => {
        console.error('[analytics] append failed:', err);
    });
    return appendQueue;
}

function updateLiveSession(event) {
    const sessionId = event.sessionId;
    if (!sessionId) return;
    if (event.type === 'session_end') {
        liveSessions.delete(sessionId);
        return;
    }
    const now = Date.now();
    const existing = liveSessions.get(sessionId);
    const watchDeltaSeconds = Math.max(0, Number(event.watchDeltaSeconds) || 0);
    const totalWatchSeconds = Math.max(0, Number(existing?.totalWatchSeconds) || 0) + watchDeltaSeconds;
    const isWatchingEvent = ['video_start', 'video_progress'].includes(event.type);
    const isStoppedWatchingEvent = ['video_stop', 'video_end'].includes(event.type);
    liveSessions.set(sessionId, {
        sessionId,
        ip: event.ip,
        userAgent: event.userAgent,
        device: Object.keys(event.device || {}).length ? event.device : existing?.device || {},
        page: event.page || event.path || existing?.page || '/',
        section: event.section || existing?.section,
        country: event.country || existing?.country,
        packageName: event.packageName || existing?.packageName,
        packageId: event.packageId || existing?.packageId,
        mediaType: isStoppedWatchingEvent ? undefined : isWatchingEvent ? event.mediaType || existing?.mediaType : existing?.mediaType,
        mediaTitle: isStoppedWatchingEvent ? undefined : isWatchingEvent ? event.mediaTitle || existing?.mediaTitle : existing?.mediaTitle,
        channelName: isStoppedWatchingEvent ? undefined : isWatchingEvent ? event.channelName || existing?.channelName : existing?.channelName,
        lastWatchingAtMs: isWatchingEvent ? now : existing?.lastWatchingAtMs,
        trialStartedAt: event.trialStartedAt || existing?.trialStartedAt,
        trialSecondsUsed: event.trialSecondsUsed ?? existing?.trialSecondsUsed,
        trialSecondsRemaining: event.trialSecondsRemaining ?? existing?.trialSecondsRemaining,
        trialLimitSeconds: event.trialLimitSeconds ?? existing?.trialLimitSeconds,
        totalWatchSeconds,
        lastEventType: event.type,
        firstSeen: existing?.firstSeen || event.ts,
        lastSeen: event.ts,
        lastSeenMs: now
    });
}

function pruneLiveSessions() {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    const watchingCutoff = Date.now() - WATCHING_WINDOW_MS;
    for (const [sessionId, session] of liveSessions.entries()) {
        if ((session.lastSeenMs || 0) < cutoff) {
            liveSessions.delete(sessionId);
            continue;
        }
        if ((session.lastWatchingAtMs || 0) < watchingCutoff) {
            session.mediaTitle = undefined;
            session.channelName = undefined;
            session.mediaType = undefined;
        }
    }
}

function publicEventFromRequest(req) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const type = cleanString(body.type, 80) || 'event';
    const sessionId = cleanString(body.sessionId, 160) || crypto.randomUUID();
    return {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        type,
        sessionId,
        ip: clientIp(req),
        userAgent: cleanString(req.get('user-agent'), 220),
        device: cleanObject(body.device),
        path: cleanString(body.path || req.get('referer'), 260),
        host: cleanString(req.get('host'), 120),
        origin: cleanString(body.origin, 180),
        page: cleanString(body.page, 120),
        section: cleanString(body.section, 80),
        country: cleanString(body.country, 120),
        packageId: cleanString(body.packageId, 160),
        packageName: cleanString(body.packageName, 200),
        categoryId: cleanString(body.categoryId, 160),
        mediaType: cleanString(body.mediaType, 80),
        mediaId: cleanString(body.mediaId, 160),
        mediaTitle: cleanString(body.mediaTitle, 220),
        channelName: cleanString(body.channelName, 220),
        watchedSeconds: cleanNumber(body.watchedSeconds),
        watchDeltaSeconds: cleanNumber(body.watchDeltaSeconds),
        currentTime: cleanNumber(body.currentTime),
        trialStartedAt: cleanString(body.trialStartedAt, 80),
        trialSecondsUsed: cleanNumber(body.trialSecondsUsed),
        trialSecondsRemaining: cleanNumber(body.trialSecondsRemaining),
        trialLimitSeconds: cleanNumber(body.trialLimitSeconds),
        referrer: cleanString(body.referrer, 260),
        meta: cleanObject(body.meta)
    };
}

async function listEventFiles(days = 7) {
    const dir = analyticsDir();
    await fs.mkdir(dir, { recursive: true });
    const maxDays = Math.min(Math.max(Number(days) || 7, 1), 30);
    const wanted = new Set();
    for (let i = 0; i < maxDays; i += 1) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        wanted.add(`events-${d.toISOString().slice(0, 10)}.jsonl`);
    }
    const files = await fs.readdir(dir).catch(() => []);
    return files
        .filter((name) => wanted.has(name))
        .sort()
        .map((name) => path.join(dir, name));
}

async function readEvents({ days = 7, limit = MAX_EVENTS_FOR_SUMMARY } = {}) {
    const files = await listEventFiles(days);
    const events = [];
    for (const file of files) {
        const raw = await fs.readFile(file, 'utf8').catch((err) => {
            if (err?.code === 'ENOENT') return '';
            throw err;
        });
        for (const line of raw.split(/\r?\n/)) {
            if (!line.trim()) continue;
            try {
                events.push(JSON.parse(line));
                if (events.length > limit) events.shift();
            } catch {
                // Ignore a single malformed line instead of losing the whole report.
            }
        }
    }
    return events;
}

function countBy(events, keyFn, { limit = 12, seconds = false } = {}) {
    const counts = new Map();
    for (const event of events) {
        const key = cleanString(keyFn(event), 220);
        if (!key) continue;
        const existing = counts.get(key) || { name: key, count: 0, seconds: 0 };
        existing.count += 1;
        if (seconds) {
            const delta = Number(event.watchDeltaSeconds);
            existing.seconds += Number.isFinite(delta)
                ? Math.max(0, delta)
                : Math.max(0, Number(event.watchedSeconds) || 0);
        }
        counts.set(key, existing);
    }
    return [...counts.values()]
        .sort((a, b) => seconds ? (b.seconds - a.seconds || b.count - a.count) : b.count - a.count)
        .slice(0, limit);
}

function summarize(events) {
    events = events.filter((event) => !isLocalEvent(event));
    const visitors = new Set(events.map((event) => event.sessionId).filter(Boolean));
    const ips = new Set(events.map((event) => event.ip).filter(Boolean));
    const watchEvents = events.filter((event) => ['video_progress', 'video_stop', 'video_end'].includes(event.type));
    const totalWatchSeconds = watchEvents.reduce((sum, event) => {
        const delta = Number(event.watchDeltaSeconds);
        if (Number.isFinite(delta)) return sum + Math.max(0, delta);
        return sum + Math.max(0, Number(event.watchedSeconds) || 0);
    }, 0);
    return {
        totalEvents: events.length,
        uniqueVisitors: visitors.size,
        uniqueIps: ips.size,
        totalWatchSeconds,
        topPages: countBy(events, (event) => event.page || event.path),
        topPackages: countBy(events.filter((event) => event.packageName), (event) => event.packageName),
        topChannels: countBy(watchEvents, (event) => event.channelName || event.mediaTitle, { seconds: true }),
        topMedia: countBy(events.filter((event) => event.mediaTitle), (event) => event.mediaTitle),
        recentEvents: events.slice(-80).reverse()
    };
}

router.post('/event', async (req, res) => {
    try {
        if (shouldIgnoreLocalAnalytics(req)) {
            res.status(204).end();
            return;
        }
        const event = publicEventFromRequest(req);
        updateLiveSession(event);
        await appendEvent(event);
        res.status(204).end();
    } catch (err) {
        console.error('[analytics] event failed:', err);
        res.status(500).json({ error: 'Analytics event failed' });
    }
});

router.get('/admin/live', requireAdmin, (req, res) => {
    pruneLiveSessions();
    const visitors = [...liveSessions.values()]
        .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
    res.json({
        activeWindowSeconds: ACTIVE_WINDOW_MS / 1000,
        total: visitors.length,
        visitors
    });
});

router.get('/admin/summary', requireAdmin, async (req, res) => {
    try {
        const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
        const events = await readEvents({ days });
        res.json({
            days,
            generatedAt: new Date().toISOString(),
            ...summarize(events)
        });
    } catch (err) {
        console.error('[analytics] summary failed:', err);
        res.status(500).json({ error: 'Analytics summary failed' });
    }
});

router.get('/admin/events', requireAdmin, async (req, res) => {
    try {
        const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
        const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
        const events = await readEvents({ days, limit });
        res.json({ days, events: events.slice(-limit).reverse() });
    } catch (err) {
        console.error('[analytics] events failed:', err);
        res.status(500).json({ error: 'Analytics events failed' });
    }
});

module.exports = router;
