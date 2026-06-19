const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const router = express.Router();

const ACTIVE_WINDOW_MS = 45 * 1000;
const WATCHING_WINDOW_MS = 45 * 1000;
const MAX_STRING_LENGTH = 260;
const MAX_EVENTS_FOR_SUMMARY = 50000;
const ANALYTICS_TIME_ZONE = process.env.NODECAST_ANALYTICS_TIME_ZONE || 'Africa/Casablanca';
const REMOTE_ANALYTICS_BASE = (process.env.NODECAST_ANALYTICS_REMOTE_BASE || 'https://nodecast.veloravip.net').replace(/\/+$/, '');
const BUTTON_CLICK_TYPES = new Set([
    'login_connect_click',
    'trial_start_click',
    'promo_banner_cta_click',
    'trial_offer_cta_click',
    'trial_offer_highlight_click',
    'trial_expired_close_click',
    'external_browser_open_click',
    'external_browser_trial_resume'
]);
const USER_ACTION_IGNORED_TYPES = new Set([
    'event',
    'heartbeat',
    'video_progress'
]);
const liveSessions = new Map();
let appendQueue = Promise.resolve();

function analyticsDir() {
    return process.env.NODECAST_ANALYTICS_DIR || path.join(__dirname, '..', '..', 'data', 'analytics');
}

function eventFilePath(date = new Date()) {
    const day = date.toISOString().slice(0, 10);
    return path.join(analyticsDir(), `events-${day}.jsonl`);
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

function isLocalAnalyticsRequest(req) {
    return isLocalHostName(req.hostname)
        || isLocalHostName(req.get('host'))
        || isLocalIp(clientIp(req));
}

function shouldProxyRemoteAdmin(req) {
    if (!REMOTE_ANALYTICS_BASE) return false;
    if (!isLocalAnalyticsRequest(req)) return false;
    try {
        const remote = new URL(REMOTE_ANALYTICS_BASE);
        return !isLocalHostName(remote.hostname);
    } catch {
        return false;
    }
}

async function proxyRemoteAdmin(req, res) {
    const target = new URL(req.originalUrl || req.url, REMOTE_ANALYTICS_BASE);
    const headers = {};
    for (const name of ['authorization', 'x-velora-admin-access', 'x-admin-access']) {
        const value = req.get(name);
        if (value) headers[name] = value;
    }
    const remote = await fetch(target, { headers, cache: 'no-store' });
    const text = await remote.text();
    res.status(remote.status);
    const contentType = remote.headers.get('content-type');
    if (contentType) res.set('content-type', contentType);
    res.send(text);
}

function cleanString(value, max = MAX_STRING_LENGTH) {
    if (value === null || value === undefined) return undefined;
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (!text) return undefined;
    return text.slice(0, max);
}

function cleanPath(value, max = MAX_STRING_LENGTH) {
    const text = cleanString(value, max);
    if (!text) return undefined;
    try {
        const url = new URL(text, 'https://nodecast.veloravip.net');
        return cleanString(`${url.pathname}${url.hash || ''}` || '/', max);
    } catch (_) {
        const withoutQuery = text.split('?')[0].split('#')[0] || text;
        return cleanString(withoutQuery, max);
    }
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

async function appendEvent(event) {
    appendQueue = appendQueue.catch(() => {}).then(async () => {
        await fs.mkdir(analyticsDir(), { recursive: true });
        await fs.appendFile(eventFilePath(new Date(event.ts || Date.now())), `${JSON.stringify(event)}\n`, 'utf8');
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
        path: cleanPath(body.path || req.get('referer'), 260),
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
        cta: cleanString(body.cta, 120),
        action: cleanString(body.action, 120),
        source: cleanString(body.source, 120),
        browser: cleanString(body.browser, 120),
        targetPath: cleanPath(body.targetPath, 260),
        referrer: cleanPath(body.referrer, 260),
        meta: cleanObject(body.meta)
    };
}

function parseDateKey(value) {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

async function analyticsEventFiles({ days = 7, from, to } = {}) {
    const dir = analyticsDir();
    await fs.mkdir(dir, { recursive: true });
    const dateFrom = parseDateKey(from);
    const dateTo = parseDateKey(to);
    if (dateFrom || dateTo) {
        const start = dateFrom || dateTo;
        const end = dateTo || dateFrom;
        const min = start <= end ? start : end;
        const max = start <= end ? end : start;
        return (await fs.readdir(dir).catch(() => []))
            .filter((name) => {
                const match = /^events-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
                return match && match[1] >= min && match[1] <= max;
            })
            .sort()
            .map((name) => path.join(dir, name));
    }
    if (days === 'all') {
        return (await fs.readdir(dir).catch(() => []))
            .filter((name) => /^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
            .sort()
            .map((name) => path.join(dir, name));
    }
    const maxDays = Math.min(Math.max(Number(days) || 7, 1), 30);
    const wanted = new Set();
    for (let i = 0; i < maxDays; i += 1) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        wanted.add(`events-${d.toISOString().slice(0, 10)}.jsonl`);
    }
    return (await fs.readdir(dir).catch(() => []))
        .filter((name) => wanted.has(name))
        .sort()
        .map((name) => path.join(dir, name));
}

async function readEvents({ days = 7, limit = MAX_EVENTS_FOR_SUMMARY, from, to } = {}) {
    const maxLimit = Math.min(Math.max(Number(limit) || MAX_EVENTS_FOR_SUMMARY, 1), MAX_EVENTS_FOR_SUMMARY);
    const files = await analyticsEventFiles({ days, from, to });
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
                if (events.length > maxLimit) events.shift();
            } catch {
                // Ignore a single malformed line instead of losing the whole report.
            }
        }
    }
    return events;
}

async function deleteAnalyticsUserEvents({ ip, days, scope, from, to }) {
    const targetIp = normalizeIp(ip);
    if (!targetIp) return { deleted: 0, filesChanged: 0 };
    const files = await analyticsEventFiles({ days, from, to });
    let deleted = 0;
    let filesChanged = 0;
    for (const file of files) {
        const raw = await fs.readFile(file, 'utf8').catch((err) => {
            if (err?.code === 'ENOENT') return '';
            throw err;
        });
        const kept = [];
        let changed = false;
        for (const line of raw.split(/\r?\n/)) {
            if (!line.trim()) continue;
            try {
                const event = JSON.parse(line);
                const inScope = eventInScope(event, { scope, from, to });
                if (inScope && sameAnalyticsIp(event.ip, targetIp)) {
                    deleted += 1;
                    changed = true;
                    continue;
                }
                kept.push(JSON.stringify(event));
            } catch {
                kept.push(line);
            }
        }
        if (changed) {
            filesChanged += 1;
            await fs.writeFile(file, kept.length ? `${kept.join('\n')}\n` : '', 'utf8');
        }
    }
    return { deleted, filesChanged };
}

function sameAnalyticsIp(a, b) {
    return normalizeIp(a) === normalizeIp(b);
}

function localDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try {
        const parts = new Intl.DateTimeFormat('en', {
            timeZone: ANALYTICS_TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);
        const get = (type) => parts.find((part) => part.type === type)?.value || '';
        return `${get('year')}-${get('month')}-${get('day')}`;
    } catch {
        return date.toISOString().slice(0, 10);
    }
}

function analyticsScope(req) {
    const from = parseDateKey(req.query.from || req.query.dateFrom || req.query.start);
    const to = parseDateKey(req.query.to || req.query.dateTo || req.query.end);
    if (from || to) {
        const start = from || to;
        const end = to || from;
        return {
            scope: 'range',
            days: 'range',
            from: start <= end ? start : end,
            to: start <= end ? end : start
        };
    }
    const scope = String(req.query.scope || req.query.period || '').trim().toLowerCase();
    if (scope === 'today') return { scope: 'today', days: 2 };
    if (scope === 'all' || scope === 'all_time' || scope === 'all-time') return { scope: 'all', days: 'all' };
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
    return { scope: 'days', days };
}

function eventInScope(event, { scope, from, to } = {}) {
    const day = localDateKey(event.ts);
    if (!day) return false;
    if (scope === 'today') return day === localDateKey();
    if (scope === 'range') {
        const start = parseDateKey(from);
        const end = parseDateKey(to);
        return (!start || day >= start) && (!end || day <= end);
    }
    return true;
}

function filterEventsForScope(events, scopeInfo) {
    return events.filter((event) => eventInScope(event, scopeInfo));
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
        visitors: summarizeVisitors(events),
        buttonClicks: summarizeButtonClicks(events),
        recentButtonClicks: recentButtonClicks(events),
        userActions: summarizeUserActions(events),
        problemMedia: summarizeProblemMedia(events),
        topPages: countBy(events, (event) => event.page || event.path),
        topPackages: countBy(events.filter((event) => event.packageName), (event) => event.packageName),
        topChannels: countBy(watchEvents, (event) => event.channelName || event.mediaTitle, { seconds: true }),
        topMedia: countBy(events.filter((event) => event.mediaTitle), (event) => event.mediaTitle),
        recentEvents: events.slice(-80).reverse()
    };
}

function compactUserAction(event) {
    return {
        ts: event.ts,
        type: event.type,
        page: event.page,
        section: event.section,
        country: event.country,
        packageId: event.packageId,
        packageName: event.packageName,
        mediaId: event.mediaId,
        mediaType: event.mediaType,
        mediaTitle: event.mediaTitle,
        channelName: event.channelName,
        cta: event.cta,
        action: event.action,
        source: event.source,
        browser: event.browser,
        trialSecondsRemaining: event.trialSecondsRemaining,
        watchedSeconds: event.watchedSeconds,
        watchDeltaSeconds: event.watchDeltaSeconds
    };
}

function mediaKey(event) {
    return [
        cleanString(event.mediaType, 80) || '',
        cleanString(event.mediaId, 160) || '',
        cleanString(event.channelName || event.mediaTitle, 220) || ''
    ].join('|');
}

function mediaName(event) {
    return cleanString(event.channelName || event.mediaTitle, 220) || 'Unknown';
}

function summarizeProblemMedia(events, limit = 200) {
    const pending = new Map();
    const problems = new Map();

    function record(event) {
        if (!event) return;
        const name = mediaName(event);
        const key = mediaKey(event) || name;
        const existing = problems.get(key) || {
            name,
            mediaType: event.mediaType,
            mediaId: event.mediaId,
            packageName: event.packageName,
            country: event.country,
            count: 0,
            ips: new Set(),
            sessions: new Set(),
            firstSeen: event.ts,
            lastSeen: event.ts
        };
        existing.count += 1;
        existing.packageName = event.packageName || existing.packageName;
        existing.country = event.country || existing.country;
        existing.mediaType = event.mediaType || existing.mediaType;
        existing.mediaId = event.mediaId || existing.mediaId;
        existing.firstSeen = String(existing.firstSeen || event.ts) < String(event.ts || '') ? existing.firstSeen : event.ts || existing.firstSeen;
        existing.lastSeen = String(existing.lastSeen || '').localeCompare(String(event.ts || '')) >= 0 ? existing.lastSeen : event.ts || existing.lastSeen;
        if (event.ip) existing.ips.add(event.ip);
        if (event.sessionId) existing.sessions.add(event.sessionId);
        problems.set(key, existing);
    }

    for (const event of events) {
        const sessionKey = event.sessionId || event.ip;
        if (!sessionKey) continue;
        if (event.type === 'media_open') {
            record(pending.get(sessionKey));
            pending.set(sessionKey, event);
            continue;
        }
        if (event.type === 'video_start') {
            const open = pending.get(sessionKey);
            if (open && mediaKey(open) === mediaKey(event)) pending.delete(sessionKey);
            continue;
        }
        if (event.type === 'package_open' || event.type === 'session_end') {
            record(pending.get(sessionKey));
            pending.delete(sessionKey);
        }
    }
    for (const open of pending.values()) record(open);

    return [...problems.values()]
        .map((item) => ({
            ...item,
            ips: item.ips.size,
            sessions: item.sessions.size
        }))
        .sort((a, b) => b.count - a.count || String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')))
        .slice(0, limit);
}

function summarizeUserActions(events, limit = 200) {
    const users = new Map();
    for (const event of events) {
        const key = event.ip || event.sessionId;
        if (!key) continue;
        const existing = users.get(key) || {
            sessionId: event.sessionId,
            ip: event.ip,
            sessionIds: new Set(),
            firstSeen: event.ts,
            lastSeen: event.ts,
            eventCount: 0,
            actionCount: 0,
            totalWatchSeconds: 0,
            watchedMedia: new Map(),
            actions: []
        };
        if (event.sessionId) existing.sessionIds.add(event.sessionId);
        existing.sessionId = event.sessionId || existing.sessionId;
        existing.ip = event.ip || existing.ip;
        existing.page = event.page || event.path || existing.page;
        existing.section = event.section || existing.section;
        existing.country = event.country || existing.country;
        existing.packageName = event.packageName || existing.packageName;
        existing.packageId = event.packageId || existing.packageId;
        existing.mediaType = event.mediaType || existing.mediaType;
        existing.mediaTitle = event.mediaTitle || existing.mediaTitle;
        existing.channelName = event.channelName || existing.channelName;
        existing.trialStartedAt = event.trialStartedAt || existing.trialStartedAt;
        existing.trialSecondsUsed = event.trialSecondsUsed ?? existing.trialSecondsUsed;
        existing.trialSecondsRemaining = event.trialSecondsRemaining ?? existing.trialSecondsRemaining;
        existing.lastEventType = event.type || existing.lastEventType;
        existing.lastSeen = event.ts || existing.lastSeen;
        existing.eventCount += 1;
        const delta = Number(event.watchDeltaSeconds);
        existing.totalWatchSeconds += Number.isFinite(delta)
            ? Math.max(0, delta)
            : Math.max(0, Number(event.watchedSeconds) || 0);
        if (['video_progress', 'video_stop', 'video_end'].includes(event.type)) {
            const watched = Number.isFinite(delta)
                ? Math.max(0, delta)
                : Math.max(0, Number(event.watchedSeconds) || 0);
            const name = mediaName(event);
            const key = mediaKey(event) || name;
            const watchedItem = existing.watchedMedia.get(key) || {
                name,
                mediaType: event.mediaType,
                mediaId: event.mediaId,
                packageName: event.packageName,
                seconds: 0,
                events: 0,
                lastSeen: event.ts
            };
            watchedItem.seconds += watched;
            watchedItem.events += 1;
            watchedItem.packageName = event.packageName || watchedItem.packageName;
            watchedItem.lastSeen = String(watchedItem.lastSeen || '').localeCompare(String(event.ts || '')) >= 0 ? watchedItem.lastSeen : event.ts || watchedItem.lastSeen;
            existing.watchedMedia.set(key, watchedItem);
        }
        if (!USER_ACTION_IGNORED_TYPES.has(event.type)) {
            existing.actionCount += 1;
            existing.actions.push(compactUserAction(event));
        }
        users.set(key, existing);
    }
    return [...users.values()]
        .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)))
        .slice(0, limit)
        .map((user) => ({
            ...user,
            sessionCount: user.sessionIds.size,
            sessionIds: undefined,
            watchedMedia: [...user.watchedMedia.values()].sort((a, b) => b.seconds - a.seconds || String(b.lastSeen || '').localeCompare(String(a.lastSeen || ''))),
            actions: user.actions
        }));
}

function summarizeButtonClicks(events, limit = 16) {
    const clicks = new Map();
    for (const event of events) {
        if (!BUTTON_CLICK_TYPES.has(event.type)) continue;
        const key = event.type;
        const existing = clicks.get(key) || {
            type: key,
            count: 0,
            visitors: new Set(),
            ips: new Set(),
            lastSeen: event.ts,
            lastIp: event.ip,
            lastPage: event.page,
            cta: event.cta,
            action: event.action,
            source: event.source,
            browser: event.browser
        };
        existing.count += 1;
        if (event.sessionId) existing.visitors.add(event.sessionId);
        if (event.ip) existing.ips.add(event.ip);
        existing.lastSeen = event.ts || existing.lastSeen;
        existing.lastIp = event.ip || existing.lastIp;
        existing.lastPage = event.page || existing.lastPage;
        existing.cta = event.cta || existing.cta;
        existing.action = event.action || existing.action;
        existing.source = event.source || existing.source;
        existing.browser = event.browser || existing.browser;
        clicks.set(key, existing);
    }
    return [...clicks.values()]
        .map((item) => ({
            ...item,
            visitors: item.visitors.size,
            ips: item.ips.size
        }))
        .sort((a, b) => b.count - a.count || String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')))
        .slice(0, limit);
}

function recentButtonClicks(events, limit = 50) {
    return events
        .filter((event) => BUTTON_CLICK_TYPES.has(event.type))
        .slice(-limit)
        .reverse()
        .map((event) => ({
            ts: event.ts,
            type: event.type,
            ip: event.ip,
            sessionId: event.sessionId,
            page: event.page,
            section: event.section,
            country: event.country,
            packageName: event.packageName,
            mediaTitle: event.mediaTitle,
            channelName: event.channelName,
            cta: event.cta,
            action: event.action,
            source: event.source,
            browser: event.browser
        }));
}

function summarizeVisitors(events, limit = 200) {
    const visitors = new Map();
    for (const event of events) {
        const key = event.ip || event.sessionId;
        if (!key) continue;
        const existing = visitors.get(key) || {
            sessionId: event.sessionId,
            ip: event.ip,
            sessionIds: new Set(),
            userAgent: event.userAgent,
            device: event.device || {},
            firstSeen: event.ts,
            lastSeen: event.ts,
            eventCount: 0,
            totalWatchSeconds: 0
        };
        if (event.sessionId) existing.sessionIds.add(event.sessionId);
        existing.sessionId = event.sessionId || existing.sessionId;
        existing.ip = event.ip || existing.ip;
        existing.userAgent = event.userAgent || existing.userAgent;
        existing.device = Object.keys(event.device || {}).length ? event.device : existing.device;
        existing.page = event.page || event.path || existing.page;
        existing.section = event.section || existing.section;
        existing.country = event.country || existing.country;
        existing.packageName = event.packageName || existing.packageName;
        existing.packageId = event.packageId || existing.packageId;
        existing.mediaType = event.mediaType || existing.mediaType;
        existing.mediaTitle = event.mediaTitle || existing.mediaTitle;
        existing.channelName = event.channelName || existing.channelName;
        existing.trialStartedAt = event.trialStartedAt || existing.trialStartedAt;
        existing.trialSecondsUsed = event.trialSecondsUsed ?? existing.trialSecondsUsed;
        existing.trialSecondsRemaining = event.trialSecondsRemaining ?? existing.trialSecondsRemaining;
        existing.trialLimitSeconds = event.trialLimitSeconds ?? existing.trialLimitSeconds;
        existing.lastEventType = event.type || existing.lastEventType;
        existing.lastSeen = event.ts || existing.lastSeen;
        existing.eventCount += 1;
        const delta = Number(event.watchDeltaSeconds);
        existing.totalWatchSeconds += Number.isFinite(delta)
            ? Math.max(0, delta)
            : Math.max(0, Number(event.watchedSeconds) || 0);
        visitors.set(key, existing);
    }
    return [...visitors.values()]
        .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)))
        .slice(0, limit)
        .map((visitor) => ({
            ...visitor,
            sessionCount: visitor.sessionIds.size,
            sessionIds: undefined
        }));
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
    if (shouldProxyRemoteAdmin(req)) {
        proxyRemoteAdmin(req, res).catch((err) => {
            console.error('[analytics] remote live proxy failed:', err);
            res.status(502).json({ error: 'Remote analytics unavailable' });
        });
        return;
    }
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
        if (shouldProxyRemoteAdmin(req)) {
            await proxyRemoteAdmin(req, res);
            return;
        }
        const scopeInfo = analyticsScope(req);
        const { scope, days, from, to } = scopeInfo;
        const events = await readEvents({ days, from, to });
        res.json({
            scope,
            days,
            from,
            to,
            timeZone: ANALYTICS_TIME_ZONE,
            generatedAt: new Date().toISOString(),
            ...summarize(filterEventsForScope(events, scopeInfo))
        });
    } catch (err) {
        console.error('[analytics] summary failed:', err);
        res.status(500).json({ error: 'Analytics summary failed' });
    }
});

router.get('/admin/events', requireAdmin, async (req, res) => {
    try {
        if (shouldProxyRemoteAdmin(req)) {
            await proxyRemoteAdmin(req, res);
            return;
        }
        const scopeInfo = analyticsScope(req);
        const { scope, days, from, to } = scopeInfo;
        const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
        const events = await readEvents({ days, limit, from, to });
        res.json({
            scope,
            days,
            from,
            to,
            timeZone: ANALYTICS_TIME_ZONE,
            events: filterEventsForScope(events, scopeInfo).slice(-limit).reverse()
        });
    } catch (err) {
        console.error('[analytics] events failed:', err);
        res.status(500).json({ error: 'Analytics events failed' });
    }
});

router.delete('/admin/user', requireAdmin, async (req, res) => {
    try {
        const scopeInfo = analyticsScope(req);
        const { scope, days, from, to } = scopeInfo;
        const ip = cleanString(req.query.ip || req.body?.ip, 120);
        if (!ip) {
            res.status(400).json({ error: 'Missing ip' });
            return;
        }
        if (shouldProxyRemoteAdmin(req)) {
            const target = new URL('/api/analytics/admin/user', REMOTE_ANALYTICS_BASE);
            if (scope === 'all' || scope === 'today') {
                target.searchParams.set('scope', scope);
            } else if (scope === 'range') {
                target.searchParams.set('from', from);
                target.searchParams.set('to', to);
            } else {
                target.searchParams.set('days', String(days));
            }
            target.searchParams.set('ip', ip);
            const headers = {};
            for (const name of ['authorization', 'x-velora-admin-access', 'x-admin-access']) {
                const value = req.get(name);
                if (value) headers[name] = value;
            }
            const remote = await fetch(target, { method: 'DELETE', headers, cache: 'no-store' });
            const text = await remote.text();
            res.status(remote.status);
            const contentType = remote.headers.get('content-type');
            if (contentType) res.set('content-type', contentType);
            res.send(text);
            return;
        }
        const result = await deleteAnalyticsUserEvents({ ip, days, scope, from, to });
        for (const [sessionId, session] of liveSessions.entries()) {
            if (sameAnalyticsIp(session.ip, ip)) liveSessions.delete(sessionId);
        }
        res.json({ ok: true, ip: normalizeIp(ip), ...result });
    } catch (err) {
        console.error('[analytics] delete user failed:', err);
        res.status(500).json({ error: 'Analytics user cleanup failed' });
    }
});

module.exports = router;
