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
const R2_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET || process.env.R2_BUCKET || process.env.NODECAST_ANALYTICS_R2_BUCKET || '';
const R2_ENDPOINT = (process.env.CLOUDFLARE_R2_ENDPOINT || process.env.R2_ENDPOINT || '').replace(/\/+$/, '');
const R2_PREFIX = (process.env.NODECAST_ANALYTICS_R2_PREFIX || 'analytics').replace(/^\/+|\/+$/g, '');
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
    'heartbeat',
    'video_progress'
]);
const liveSessions = new Map();
let appendQueue = Promise.resolve();
let migrationPromise = null;

function legacyAnalyticsDir() {
    return process.env.NODECAST_ANALYTICS_DIR || path.join(__dirname, '..', '..', 'data', 'analytics');
}

function requireR2Config() {
    const missing = [];
    if (!R2_BUCKET) missing.push('CLOUDFLARE_R2_BUCKET or R2_BUCKET');
    if (!R2_ACCESS_KEY_ID) missing.push('CLOUDFLARE_R2_ACCESS_KEY_ID or R2_ACCESS_KEY_ID');
    if (!R2_SECRET_ACCESS_KEY) missing.push('CLOUDFLARE_R2_SECRET_ACCESS_KEY or R2_SECRET_ACCESS_KEY');
    if (!R2_ENDPOINT && !R2_ACCOUNT_ID) missing.push('CLOUDFLARE_R2_ENDPOINT or CLOUDFLARE_R2_ACCOUNT_ID');
    if (missing.length) throw new Error(`R2 analytics storage is not configured. Missing: ${missing.join(', ')}`);
}

function r2BaseUrl() {
    requireR2Config();
    return R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function analyticsObjectKey(date = new Date()) {
    const day = date.toISOString().slice(0, 10);
    return `${R2_PREFIX ? `${R2_PREFIX}/` : ''}events-${day}.jsonl`;
}

function hmac(key, value, encoding) {
    return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding);
}

function sha256(value, encoding = 'hex') {
    return crypto.createHash('sha256').update(value).digest(encoding);
}

function r2SigningKey(dateStamp) {
    const kDate = hmac(`AWS4${R2_SECRET_ACCESS_KEY}`, dateStamp);
    const kRegion = hmac(kDate, 'auto');
    const kService = hmac(kRegion, 's3');
    return hmac(kService, 'aws4_request');
}

function encodePath(pathname) {
    return pathname.split('/').map((part) => encodeURIComponent(part)).join('/');
}

async function r2Request(method, key = '', { query = {}, body = '', contentType = 'application/octet-stream' } = {}) {
    requireR2Config();
    const base = r2BaseUrl();
    const url = new URL(`${base}/${encodeURIComponent(R2_BUCKET)}${key ? `/${encodePath(key)}` : ''}`);
    for (const [name, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
    }

    const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : '';
    const payloadHash = sha256(payload);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const canonicalQuery = [...url.searchParams.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
        .join('&');
    const headers = {
        host: url.host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate
    };
    if (method !== 'GET' && method !== 'HEAD') headers['content-type'] = contentType;
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers)
        .sort()
        .map((name) => `${name}:${headers[name]}\n`)
        .join('');
    const canonicalRequest = [
        method,
        url.pathname,
        canonicalQuery,
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n');
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256(canonicalRequest)
    ].join('\n');
    const signature = hmac(r2SigningKey(dateStamp), stringToSign, 'hex');
    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(url, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : payload
    });
    return res;
}

async function getR2Text(key) {
    const res = await r2Request('GET', key);
    if (res.status === 404) return '';
    const text = await res.text();
    if (!res.ok) throw new Error(`R2 GET ${key} failed: ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
    return text;
}

async function putR2Text(key, text) {
    const res = await r2Request('PUT', key, {
        body: text,
        contentType: 'application/x-ndjson; charset=utf-8'
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`R2 PUT ${key} failed: ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
}

function parseListObjectsXml(xml) {
    const keys = [];
    const regex = /<Key>([\s\S]*?)<\/Key>/g;
    let match;
    while ((match = regex.exec(xml))) {
        keys.push(match[1]
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'"));
    }
    return keys;
}

async function listR2AnalyticsKeys() {
    const prefix = R2_PREFIX ? `${R2_PREFIX}/events-` : 'events-';
    const res = await r2Request('GET', '', {
        query: {
            'list-type': '2',
            prefix,
            'max-keys': 1000
        }
    });
    const xml = await res.text();
    if (!res.ok) throw new Error(`R2 LIST failed: ${res.status} ${res.statusText}: ${xml.slice(0, 300)}`);
    return parseListObjectsXml(xml)
        .filter((key) => /events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(key))
        .sort();
}

async function migrateLegacyAnalyticsFiles() {
    if (migrationPromise) return migrationPromise;
    migrationPromise = (async () => {
        const dir = legacyAnalyticsDir();
        const files = await fs.readdir(dir).catch((err) => {
            if (err?.code === 'ENOENT') return [];
            throw err;
        });
        const eventFiles = files
            .filter((name) => /^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
            .sort();
        if (!eventFiles.length) return;

        let imported = 0;
        for (const file of eventFiles) {
            const raw = await fs.readFile(path.join(dir, file), 'utf8').catch((err) => {
                if (err?.code === 'ENOENT') return '';
                throw err;
            });
            const key = `${R2_PREFIX ? `${R2_PREFIX}/` : ''}${file}`;
            const existing = await getR2Text(key);
            if (existing.trim()) continue;
            let next = existing && !existing.endsWith('\n') ? `${existing}\n` : existing;
            for (const line of raw.split(/\r?\n/)) {
                if (!line.trim()) continue;
                try {
                    const event = JSON.parse(line);
                    next += `${JSON.stringify(event)}\n`;
                    imported += 1;
                } catch {
                    // Ignore a single malformed line instead of losing the whole import.
                }
            }
            await putR2Text(key, next);
        }
        if (imported) console.log(`[analytics] imported ${imported} legacy JSONL events into R2`);
    })().catch((err) => {
        migrationPromise = null;
        console.error('[analytics] legacy import failed:', err);
    });
    return migrationPromise;
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

async function appendEvent(event) {
    appendQueue = appendQueue.catch(() => {}).then(async () => {
        await migrateLegacyAnalyticsFiles();
        const key = analyticsObjectKey(new Date(event.ts || Date.now()));
        const existing = await getR2Text(key);
        const prefix = existing && !existing.endsWith('\n') ? `${existing}\n` : existing;
        await putR2Text(key, `${prefix}${JSON.stringify(event)}\n`);
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
        cta: cleanString(body.cta, 120),
        action: cleanString(body.action, 120),
        source: cleanString(body.source, 120),
        browser: cleanString(body.browser, 120),
        targetPath: cleanString(body.targetPath, 260),
        referrer: cleanString(body.referrer, 260),
        meta: cleanObject(body.meta)
    };
}

async function readEvents({ days = 7, limit = MAX_EVENTS_FOR_SUMMARY } = {}) {
    await migrateLegacyAnalyticsFiles();
    const maxLimit = Math.min(Math.max(Number(limit) || MAX_EVENTS_FOR_SUMMARY, 1), MAX_EVENTS_FOR_SUMMARY);
    let keys;
    if (days === 'all') {
        keys = await listR2AnalyticsKeys();
    } else {
        const maxDays = Math.min(Math.max(Number(days) || 7, 1), 30);
        keys = [];
        const wanted = new Set();
        for (let i = 0; i < maxDays; i += 1) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            wanted.add(analyticsObjectKey(d));
        }
        keys = [...wanted].sort();
    }
    const events = [];
    for (const key of keys) {
        const raw = await getR2Text(key);
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
    const scope = String(req.query.scope || req.query.period || '').trim().toLowerCase();
    if (scope === 'today') return { scope: 'today', days: 2 };
    if (scope === 'all' || scope === 'all_time' || scope === 'all-time') return { scope: 'all', days: 'all' };
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
    return { scope: 'days', days };
}

function filterEventsForScope(events, scope) {
    if (scope !== 'today') return events;
    const today = localDateKey();
    return events.filter((event) => localDateKey(event.ts) === today);
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

function summarizeUserActions(events, limit = 200) {
    const users = new Map();
    for (const event of events) {
        const key = event.sessionId || event.ip;
        if (!key) continue;
        const existing = users.get(key) || {
            sessionId: event.sessionId,
            ip: event.ip,
            firstSeen: event.ts,
            lastSeen: event.ts,
            eventCount: 0,
            actionCount: 0,
            totalWatchSeconds: 0,
            actions: []
        };
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
        const key = event.sessionId || event.ip;
        if (!key) continue;
        const existing = visitors.get(key) || {
            sessionId: event.sessionId,
            ip: event.ip,
            userAgent: event.userAgent,
            device: event.device || {},
            firstSeen: event.ts,
            lastSeen: event.ts,
            eventCount: 0,
            totalWatchSeconds: 0
        };
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
        .slice(0, limit);
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
        const { scope, days } = analyticsScope(req);
        const events = await readEvents({ days });
        res.json({
            scope,
            days,
            timeZone: ANALYTICS_TIME_ZONE,
            generatedAt: new Date().toISOString(),
            ...summarize(filterEventsForScope(events, scope))
        });
    } catch (err) {
        console.error('[analytics] summary failed:', err);
        res.status(500).json({ error: 'Analytics summary failed' });
    }
});

router.get('/admin/events', requireAdmin, async (req, res) => {
    try {
        const { scope, days } = analyticsScope(req);
        const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
        const events = await readEvents({ days, limit });
        res.json({
            scope,
            days,
            timeZone: ANALYTICS_TIME_ZONE,
            events: filterEventsForScope(events, scope).slice(-limit).reverse()
        });
    } catch (err) {
        console.error('[analytics] events failed:', err);
        res.status(500).json({ error: 'Analytics events failed' });
    }
});

module.exports = router;
