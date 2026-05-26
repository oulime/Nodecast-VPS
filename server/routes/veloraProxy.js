const express = require('express');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const router = express.Router();

const cookieByHost = new Map();
const lastM3u8ByHlsDir = new Map();

function isHttpUrl(s) {
    try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function fromBase64UrlUtf8(b64) {
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const norm = b64.replace(/-/g, '+').replace(/_/g, '/') + pad;
    return Buffer.from(norm, 'base64').toString('utf8');
}

function stripDefaultPortHref(url) {
    try {
        const u = new URL(url);
        if (u.protocol === 'http:' && u.port === '80') u.port = '';
        if (u.protocol === 'https:' && u.port === '443') u.port = '';
        return u.href;
    } catch {
        return url;
    }
}

function refererForTarget(targetUrl) {
    const u = new URL(targetUrl);
    if (!u.pathname || u.pathname === '/') {
        return stripDefaultPortHref(`${u.origin}/`);
    }
    const dir = u.pathname.replace(/\/[^/]*$/, '/') || '/';
    return stripDefaultPortHref(`${u.origin}${dir}`);
}

function hlsTokenDirKey(url) {
    try {
        const u = new URL(url);
        const m = u.pathname.match(/^(\/hls\/[^/]+)\//i);
        if (!m) return null;
        return stripDefaultPortHref(`${u.origin}${m[1]}/`);
    } catch {
        return null;
    }
}

function parseSetCookieNameValue(line) {
    const first = line.split(';')[0]?.trim();
    if (!first || !first.includes('=')) return null;
    const i = first.indexOf('=');
    const name = first.slice(0, i).trim();
    const value = first.slice(i + 1).trim();
    if (!name) return null;
    return [name, value];
}

function ingestUpstreamSetCookies(upstream, requestUrl) {
    const host = new URL(requestUrl).host;
    const getSetCookie = upstream.headers.getSetCookie;
    const lines = typeof getSetCookie === 'function' ? getSetCookie.call(upstream.headers) : [];
    const fallback = upstream.headers.get('set-cookie');
    const allLines = lines.length > 0 ? lines : fallback ? [fallback] : [];
    if (!allLines.length) return;

    let jar = cookieByHost.get(host);
    if (!jar) {
        jar = Object.create(null);
        cookieByHost.set(host, jar);
    }
    for (const line of allLines) {
        const p = parseSetCookieNameValue(line);
        if (p) jar[p[0]] = p[1];
    }
}

function cookieHeaderForUpstreamUrl(requestUrl) {
    const host = new URL(requestUrl).host;
    const jar = cookieByHost.get(host);
    if (!jar) return undefined;
    const pairs = Object.entries(jar).filter(([, v]) => v !== '');
    if (!pairs.length) return undefined;
    return pairs.map(([k, v]) => `${k}=${v}`).join('; ');
}

function buildProxyUrl(req, target, fromPlaylist) {
    const base = `${req.protocol}://${req.get('host')}${req.baseUrl}`;
    const p = new URLSearchParams();
    p.set('target', target);
    p.set('from', fromPlaylist || target);
    return `${base}?${p.toString()}`;
}

function buildUpstreamHeaders(req, targetUrl, fromPlaylist) {
    const target = new URL(targetUrl);
    const targetPath = target.pathname;
    const targetUnderHls = /^\/hls\//i.test(targetPath);
    const targetIsTsUnderHls = targetUnderHls && /\.ts$/i.test(targetPath);

    let referer = refererForTarget(targetUrl);
    if (fromPlaylist && isHttpUrl(fromPlaylist)) {
        try {
            const from = new URL(fromPlaylist);
            if (from.origin === target.origin) {
                if (targetIsTsUnderHls) {
                    referer = refererForTarget(targetUrl);
                } else if (/\/live\//i.test(from.pathname) && targetUnderHls) {
                    referer = refererForTarget(targetUrl);
                } else if (/\/live\/.+\.m3u8$/i.test(targetPath)) {
                    referer = stripDefaultPortHref(`${target.origin}/`);
                } else if (
                    /\/get_vod_info$/i.test(targetPath) ||
                    /\/get_series_info$/i.test(targetPath) ||
                    /\/player_api(\.php)?$/i.test(targetPath)
                ) {
                    referer = stripDefaultPortHref(`${target.origin}/`);
                } else {
                    referer = stripDefaultPortHref(from.href);
                }
            }
        } catch {
            // Keep default referer.
        }
    }

    if (targetUnderHls && !/\.m3u8$/i.test(targetPath) && !targetIsTsUnderHls) {
        const dirKey = hlsTokenDirKey(targetUrl);
        const lastM3u8 = dirKey ? lastM3u8ByHlsDir.get(dirKey) : undefined;
        if (lastM3u8) referer = stripDefaultPortHref(lastM3u8);
    }

    const isXtreamInfoEndpoint =
        /\/get_vod_info$/i.test(targetPath) ||
        /\/get_series_info$/i.test(targetPath) ||
        /\/player_api(\.php)?$/i.test(targetPath);

    const headers = {
        Accept: isXtreamInfoEndpoint
            ? 'application/json, text/plain;q=0.9, */*;q=0.8'
            : req.get('accept') || '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: stripDefaultPortHref(referer),
        'User-Agent': process.env.VELORA_PROXY_USER_AGENT || 'VLC/3.0.18 LibVLC/3.0.18'
    };

    const cookie = cookieHeaderForUpstreamUrl(targetUrl);
    if (cookie) headers.Cookie = cookie;

    if (!targetUnderHls || /\.m3u8$/i.test(targetPath) || targetIsTsUnderHls) {
        headers.Origin = stripDefaultPortHref(target.origin);
    }

    const range = req.get('range');
    if (range?.trim()) headers.Range = range;
    const ifRange = req.get('if-range');
    if (ifRange?.trim()) headers['If-Range'] = ifRange;
    const authorization = req.get('authorization');
    if (authorization?.trim()) headers.Authorization = authorization;
    const ifNoneMatch = req.get('if-none-match');
    if (ifNoneMatch?.trim()) headers['If-None-Match'] = ifNoneMatch;
    const ifModifiedSince = req.get('if-modified-since');
    if (ifModifiedSince?.trim()) headers['If-Modified-Since'] = ifModifiedSince;

    return headers;
}

function rewriteM3u8(req, body, playlistUrl) {
    const base = new URL(playlistUrl);
    return body
        .split('\n')
        .map(line => {
            const tag = line.trim();
            if ((tag.startsWith('#EXT-X-KEY:') || tag.startsWith('#EXT-X-MAP:')) && tag.includes('URI=')) {
                return line.replace(/URI=["']([^"']+)["']/g, (match, uri) => {
                    try {
                        const resolved = new URL(uri, base).href;
                        return `URI="${buildProxyUrl(req, resolved, playlistUrl)}"`;
                    } catch {
                        return match;
                    }
                });
            }
            if (!tag || tag.startsWith('#')) return line;
            try {
                return buildProxyUrl(req, new URL(tag, base).href, playlistUrl);
            } catch {
                return line;
            }
        })
        .join('\n');
}

const HOP_BY_HOP = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'upgrade',
    'set-cookie',
    'transfer-encoding'
]);

function copyUpstreamHeaders(upstream, res) {
    upstream.headers.forEach((value, key) => {
        const lk = key.toLowerCase();
        if (HOP_BY_HOP.has(lk)) return;
        try {
            res.setHeader(key, value);
        } catch {
            // Ignore invalid upstream headers.
        }
    });
}

function isLikelyLivePlaylist(body) {
    return (
        /#EXT-X-TARGETDURATION:/i.test(body) ||
        /#EXT-X-MEDIA-SEQUENCE:/i.test(body) ||
        /#EXT-X-PLAYLIST-TYPE:\s*EVENT/i.test(body)
    );
}

function isMediaOrImage(targetUrl, contentType) {
    const pathname = new URL(targetUrl).pathname;
    return /\.(ts|m4s|mp4|m4v|mkv|aac|mp3|webm|vtt|webvtt|m3u8\.ts|avif|gif|heic|jpeg|jpg|png|svg|webp)$/i.test(pathname) ||
        /\/segment\//i.test(pathname) ||
        contentType.startsWith('image/');
}

function applyCacheHeaders(res, upstream, targetUrl, contentType) {
    if (/\.m3u8$/i.test(new URL(targetUrl).pathname)) return;
    if (!isMediaOrImage(targetUrl, contentType)) return;
    if (!upstream.headers.get('cache-control')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
}

function readBody(req) {
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        return Buffer.from(JSON.stringify(req.body), 'utf8');
    }
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function parseProxyTarget(req, res) {
    let target = req.query.target || req.query.url;
    let from = req.query.from;

    if (Array.isArray(target)) target = target[0];
    if (Array.isArray(from)) from = from[0];

    const targetB64 = Array.isArray(req.query.targetB64) ? req.query.targetB64[0] : req.query.targetB64;
    const fromB64 = Array.isArray(req.query.fromB64) ? req.query.fromB64[0] : req.query.fromB64;

    if (targetB64) {
        try {
            target = fromBase64UrlUtf8(targetB64);
        } catch {
            res.status(400).send('Bad targetB64');
            return null;
        }
    }
    if (fromB64) {
        try {
            from = fromBase64UrlUtf8(fromB64);
        } catch {
            res.status(400).send('Bad fromB64');
            return null;
        }
    }

    if (!from && target) from = target;
    if (!target || !isHttpUrl(target)) {
        res.status(400).send('Bad target');
        return null;
    }

    const rawAllowed = process.env.VELORA_PROXY_ALLOWED_HOSTS || process.env.PROXY_ALLOWED_HOSTS || '';
    const allowed = rawAllowed.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length) {
        const u = new URL(target);
        const hostPort = u.port ? `${u.hostname}:${u.port}` : u.hostname;
        const h = u.hostname.toLowerCase();
        const hp = hostPort.toLowerCase();
        if (!allowed.some(a => a === h || a === hp)) {
            res.status(403).send(`Proxy target host not allowed: ${hostPort}`);
            return null;
        }
    }

    return { target, from };
}

router.options('/', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range,Content-Type,Authorization,X-Playable-Probe');
    res.status(204).end();
});

router.all('/', async (req, res) => {
    const parsed = parseProxyTarget(req, res);
    if (!parsed) return;

    const { target, from } = parsed;
    const method = (req.method || 'GET').toUpperCase();
    const targetPath = new URL(target).pathname;
    const isPlaylistRequest = /\.m3u8$/i.test(targetPath);
    const isMediaSegmentRequest =
        /\.(ts|m4s|mp4|m4v|aac|mp3|webm|mkv)$/i.test(targetPath) ||
        /\/segment\//i.test(targetPath);

    const abortMs = isMediaSegmentRequest ? 180000 : isPlaylistRequest ? 45000 : 60000;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), abortMs);

    res.once('close', () => {
        try {
            ac.abort();
        } catch {
            // Already aborted.
        }
    });

    try {
        const headers = buildUpstreamHeaders(req, target, from);
        let body;
        if (method !== 'GET' && method !== 'HEAD') {
            const buf = await readBody(req);
            if (buf.length > 0) {
                body = buf;
                headers['Content-Type'] = req.get('content-type') || 'application/json';
                headers['Content-Length'] = String(buf.length);
            }
        }

        const upstream = await fetch(target, {
            method,
            headers,
            body,
            signal: ac.signal
        });
        ingestUpstreamSetCookies(upstream, target);

        const contentType = upstream.headers.get('content-type')?.split(';')[0]?.trim() || '';
        const isM3u8Rewrite =
            upstream.ok &&
            (contentType === 'application/vnd.apple.mpegurl' ||
                contentType === 'application/x-mpegURL' ||
                target.toLowerCase().includes('.m3u8'));

        res.setHeader('Access-Control-Allow-Origin', '*');

        if (isM3u8Rewrite) {
            const buf = Buffer.from(await upstream.arrayBuffer());
            const dirKey = hlsTokenDirKey(target);
            if (dirKey) lastM3u8ByHlsDir.set(dirKey, stripDefaultPortHref(target));
            const text = buf.toString('utf8');
            const rewritten = rewriteM3u8(req, text, target);

            res.status(upstream.status);
            copyUpstreamHeaders(upstream, res);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.removeHeader('Content-Length');
            if (!upstream.headers.get('cache-control') && isLikelyLivePlaylist(text)) {
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
            res.send(Buffer.from(rewritten, 'utf8'));
            return;
        }

        res.status(upstream.status);
        copyUpstreamHeaders(upstream, res);
        if (!res.getHeader('Content-Type') && contentType) res.setHeader('Content-Type', contentType);
        if (!res.getHeader('Accept-Ranges')) {
            const acceptRanges = upstream.headers.get('accept-ranges');
            if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
        }
        applyCacheHeaders(res, upstream, target, contentType);

        if (
            upstream.status === 204 ||
            upstream.status === 304 ||
            method === 'HEAD' ||
            !upstream.body
        ) {
            res.end();
            return;
        }

        if (typeof res.flushHeaders === 'function') res.flushHeaders();
        await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (err) {
        if (res.headersSent) {
            res.destroy();
            return;
        }
        const msg = err && err.name === 'AbortError'
            ? `Upstream request timed out (${Math.round(abortMs / 1000)}s).`
            : err?.message || 'Proxy error';
        res.status(502).send(msg);
    } finally {
        clearTimeout(timer);
    }
});

module.exports = router;
