const express = require('express');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const passport = require('passport');
const syncService = require('./services/syncService');
const veloraCatalogCache = require('./services/veloraCatalogCache');

const app = express();
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;

// Configure global proxy dispatcher if UPSTREAM_PROXY, HTTP_PROXY, or db.json upstreamProxy is set
try {
    const { ProxyAgent, setGlobalDispatcher } = require('undici');
    let proxyUrl = process.env.UPSTREAM_PROXY || process.env.HTTP_PROXY || process.env.http_proxy;
    if (!proxyUrl) {
        try {
            const dbData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'db.json'), 'utf8'));
            if (dbData?.settings?.upstreamProxy && String(dbData.settings.upstreamProxy).trim()) {
                proxyUrl = String(dbData.settings.upstreamProxy).trim();
            }
        } catch (_) {}
    }
    if (proxyUrl) {
        setGlobalDispatcher(new ProxyAgent(proxyUrl));
        console.log(`[Proxy] Global undici dispatcher configured with ${proxyUrl}`);
    }
} catch (e) {
    console.warn('[Proxy] Failed to configure global undici dispatcher:', e.message);
}
const VPS_DATA_API_BASE = String(
    process.env.VPS_DATA_API_BASE || 'https://nodecast.veloravip.net'
).trim().replace(/\/+$/, '');
const USE_VPS_DATA_API = process.env.NODE_ENV !== 'production'
    && !/^(1|true|yes)$/i.test(String(process.env.VPS_DATA_API_DISABLED || '').trim());
const VOD_POSTER_CACHE_PATH = path.join(__dirname, '..', 'data', 'vod-poster-cache.json');
let vodPosterCache = {};
let vodPosterSaveTimer = null;
try { vodPosterCache = JSON.parse(fs.readFileSync(VOD_POSTER_CACHE_PATH, 'utf8')) || {}; } catch (_) {}

function decodeCatalogId(value) {
    try {
        const decoded = Buffer.from(String(value || ''), 'base64url').toString('utf8');
        const separator = decoded.indexOf(':');
        return separator > 0 ? { sourceId: decoded.slice(0, separator), vodId: decoded.slice(separator + 1) } : null;
    } catch (_) { return null; }
}

function saveVodPostersSoon() {
    if (vodPosterSaveTimer) return;
    vodPosterSaveTimer = setTimeout(() => {
        vodPosterSaveTimer = null;
        fs.promises.writeFile(VOD_POSTER_CACHE_PATH, JSON.stringify(vodPosterCache))
            .catch(error => console.warn('[VOD posters] Cache save failed:', error.message));
    }, 200);
    vodPosterSaveTimer.unref?.();
}

async function enrichVpsVodPosters(items, routeSourceId, headers) {
    const missing = items.map(item => {
        const decoded = item.raw_stream_id ? null : decodeCatalogId(item.stream_id);
        const sourceId = String(item.source_id ?? item.sourceId ?? decoded?.sourceId ?? routeSourceId ?? '').trim();
        const vodId = String(item.raw_stream_id ?? item.streamId ?? item.id ?? decoded?.vodId ?? item.stream_id ?? '').trim();
        return { item, sourceId, vodId };
    }).filter(entry => entry.sourceId && entry.vodId && !String(entry.item.image || entry.item.thumbUrl || entry.item.stream_icon || entry.item.cover || entry.item.cover_big || '').trim());
    let cursor = 0;
    let changed = false;
    async function worker() {
        while (cursor < missing.length) {
            const { item, sourceId, vodId } = missing[cursor++];
            const key = `${sourceId}:${vodId}`;
            let poster = Object.prototype.hasOwnProperty.call(vodPosterCache, key) ? vodPosterCache[key] : undefined;
            if (poster === null) poster = undefined;
            if (poster === undefined) {
                try {
                    const detailUrl = new URL(`/api/proxy/xtream/${encodeURIComponent(sourceId)}/vod_info`, `${VPS_DATA_API_BASE}/`);
                    detailUrl.searchParams.set('vod_id', vodId);
                    const detailResponse = await fetch(detailUrl, { headers, cache: 'no-store', signal: AbortSignal.timeout(2500) });
                    if (detailResponse.ok) {
                        const detail = await detailResponse.json();
                        poster = String(detail?.info?.movie_image || detail?.info?.cover_big || detail?.movie_data?.stream_icon || '').trim();
                        if (poster) {
                            vodPosterCache[key] = poster;
                            changed = true;
                        } else if (Object.prototype.hasOwnProperty.call(vodPosterCache, key)) {
                            delete vodPosterCache[key];
                            changed = true;
                        }
                    }
                } catch (_) { poster = ''; }
            }
            if (poster) {
                item.image = poster;
                item.thumbUrl = poster;
                item.stream_icon = poster;
                item.cover = poster;
                item.cover_big = poster;
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(64, missing.length) }, worker));
    if (changed) saveVodPostersSoon();
    return items;
}

function normalizedPosterTitle(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/^\s*[^-]{1,14}\s+-\s+/, '').replace(/\s+/g, ' ').trim();
}

async function enrichVpsHomePosterMatches(entries, headers) {
    const missing = entries.filter(entry => !String(entry?.thumbUrl || '').trim() && entry?.name);
    if (!missing.length) return entries;
    try {
        const url = new URL('/api/proxy/xtream/all/vod_streams', `${VPS_DATA_API_BASE}/`);
        const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(60000) });
        if (!response.ok) return entries;
        const catalogue = await response.json();
        if (!Array.isArray(catalogue)) return entries;
        const posters = new Map();
        for (const item of catalogue) {
            const poster = String(item.stream_icon || item.cover || item.cover_big || '').trim();
            const title = normalizedPosterTitle(item.name || item.title);
            if (poster && title && !posters.has(title)) posters.set(title, poster);
        }
        for (const entry of missing) {
            const poster = posters.get(normalizedPosterTitle(entry.name));
            if (poster) entry.thumbUrl = poster;
        }
    } catch (error) {
        console.warn('[Home cache] Current catalogue poster matching failed:', error.message);
    }
    return entries;
}

// Trust proxy headers (X-Forwarded-Proto, X-Forwarded-For, etc.)
// Required for correct protocol detection behind reverse proxies (nginx, Caddy, etc.)
app.set('trust proxy', true);

// Middleware
app.use(express.json({ limit: '50mb' }));

// Initialize Passport
const session = require('express-session');
app.use(session({
    secret: process.env.JWT_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// A development checkout must use the VPS as its single source of truth. These
// endpoints own the SQLite catalogue (plus its closely related configuration),
// while playback/transcoding endpoints continue to run on the local machine.
const VPS_DATA_API_PATHS = [
    '/api/auth',
    '/api/admin/paid-users',
    '/api/sources',
    '/api/proxy',
    '/api/velora-proxy',
    '/proxy',
    '/api/channels',
    '/api/favorites',
    '/api/settings',
    '/api/history',
    '/api/search',
    '/api/velora/catalog',
    '/api/velora-db',
    '/api/package-covers',
    '/api/country-logos',
    '/api/r2-package-cover',
    '/api/analytics',
    '/uploads'
];

function isVpsDataApiRequest(requestPath) {
    return VPS_DATA_API_PATHS.some(prefix => (
        requestPath === prefix || requestPath.startsWith(`${prefix}/`)
    ));
}

if (USE_VPS_DATA_API) {
    app.use(async (req, res, next) => {
        if (req.path.startsWith('/uploads/')) {
            const localUploadPath = path.join(__dirname, '..', 'public', req.path.replace(/^\/+/, ''));
            if (fs.existsSync(localUploadPath)) {
                return res.sendFile(localUploadPath);
            }
        }
        if (req.path === '/api/velora-db/hero-slider' || req.path.startsWith('/api/velora-db/rest/v1/admin_hero_slider') || req.path.startsWith('/api/velora-db/hero-slider/')) {
            return next();
        }
        if (!isVpsDataApiRequest(req.path)) return next();

        const controller = new AbortController();
        let timedOut = false;
        let clientDisconnected = false;
        const isHomeCacheRebuild = req.method === 'POST'
            && req.path === '/api/velora-db/home-cache/rebuild';
        const isFullCatalogSync = req.method === 'POST'
            && req.path === '/api/sources/sync-catalog';
        const isCatalogStream = req.path.startsWith('/api/proxy/xtream/')
            || req.path.startsWith('/api/channels')
            || req.path.startsWith('/api/velora/catalog')
            || req.path.startsWith('/api/velora-db');
        const requestTimeoutMs = isFullCatalogSync
            ? 10 * 60 * 1000
            : isHomeCacheRebuild
                ? 2 * 60 * 1000
                : isCatalogStream
                    ? 3 * 60 * 1000
                    : 60000;
        const timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, requestTimeoutMs);
        const clearRequest = () => clearTimeout(timeout);
        res.once('finish', clearRequest);
        res.once('close', () => {
            clearRequest();
            if (!res.writableEnded) {
                clientDisconnected = true;
                controller.abort();
            }
        });

        try {
            const target = new URL(req.originalUrl, `${VPS_DATA_API_BASE}/`);
            const headers = { ...req.headers };
            delete headers.host;
            delete headers['content-length'];
            delete headers['accept-encoding'];
            delete headers['transfer-encoding'];
            delete headers.connection;

            if (req.method === 'POST' && req.path === '/api/velora-db/home-cache/rebuild') {
                // Force the VPS data service to derive Home entries from its
                // authoritative package memberships instead of browser data.
                req.body = {};
            }

            const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body !== undefined;
            const upstream = await fetch(target, {
                method: req.method,
                headers,
                body: hasBody ? JSON.stringify(req.body) : undefined,
                redirect: 'follow',
                signal: controller.signal
            });

            if (upstream.status === 404 || (!upstream.ok && (req.path.startsWith('/api/proxy/') || req.path.startsWith('/api/velora-db/admin/custom-logos')))) {
                clearRequest();
                return next();
            }

            res.status(upstream.status);
            upstream.headers.forEach((value, name) => {
                if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(name.toLowerCase())) {
                    res.setHeader(name, value);
                }
            });
            res.setHeader('X-Nodecast-Data-Source', VPS_DATA_API_BASE);

            const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
            if (req.path.startsWith('/uploads/') && contentType.includes('text/html')) {
                clearRequest();
                const localUploadPath = path.join(__dirname, '..', 'public', req.path.replace(/^\/+/, ''));
                if (fs.existsSync(localUploadPath)) {
                    return res.sendFile(localUploadPath);
                }
                return res.status(404).end();
            }

            if (upstream.ok && req.path === '/api/velora-db/home-cache' && contentType.includes('application/json')) {
                const data = await upstream.json().catch(() => null);
                if (data && Array.isArray(data.sections)) {
                    let logoCache = {};
                    try { logoCache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'vod-title-logo-cache.json'), 'utf8')) || {}; } catch (_) {}
                    for (const section of data.sections) {
                        if (section.card_orientation === 'horizontal' && Array.isArray(section.entries)) {
                            const isSeries = section.content_type === 'series';
                            const type = isSeries ? 'tv' : 'movie';
                            for (const entry of section.entries) {
                                if (!entry.title_logo && entry.name) {
                                    const raw = String(entry.name).trim().toLowerCase();
                                    let found = logoCache[`${type}:${raw}`];
                                    if (!found) {
                                        for (const [k, v] of Object.entries(logoCache)) {
                                            if (k.startsWith(`${type}:`) && v !== 'NONE') {
                                                const titlePart = k.slice(type.length + 1);
                                                if (raw === titlePart || raw.startsWith(titlePart) || titlePart.startsWith(raw)) {
                                                    found = v;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    if (found && found !== 'NONE') {
                                        entry.title_logo = found;
                                    }
                                }
                            }
                        }
                    }
                    return res.json(data);
                }
            }

            if (upstream.ok && req.path === '/api/package-covers/all' && contentType.includes('application/json')) {
                const data = await upstream.json().catch(() => null);
                if (data && data.covers) {
                    const filteredCovers = {};
                    for (const [k, v] of Object.entries(data.covers)) {
                        const url = typeof v === 'string' ? v : v?.coverUrl || '';
                        if (url && !url.includes('image.tmdb.org') && !url.includes('/t/p/') && !url.includes('/w600_and_h900_bestv2/')) {
                            filteredCovers[k] = url;
                        }
                    }
                    return res.json({ ok: true, covers: filteredCovers, count: Object.keys(filteredCovers).length });
                }
            }

            const vodRoute = req.path.match(/^\/api\/proxy\/xtream\/([^/]+)\/vod_streams$/i);

            if (upstream.ok && vodRoute && (req.query.category_id || req.query.cat_id) && contentType.includes('application/json')) {
                const items = await upstream.json().catch(() => null);
                if (Array.isArray(items)) {
                    await enrichVpsVodPosters(items, vodRoute[1] === 'all' ? '' : vodRoute[1], headers);
                    return res.json(items);
                }
            }

            if (!upstream.body || req.method === 'HEAD') return res.end();
            await pipeline(Readable.fromWeb(upstream.body), res);
        } catch (err) {
            if (controller.signal.aborted || err?.name === 'AbortError') {
                if (clientDisconnected || res.destroyed || res.writableEnded) return;
                if (timedOut && !res.headersSent) {
                    return res.status(504).json({ error: 'VPS data API timed out' });
                }
                res.destroy();
                return;
            }
            console.error('[VPS data API] Request failed:', err);
            if (!res.headersSent) {
                if (req.path.startsWith('/api/package-covers')) {
                    clearRequest();
                    return next();
                }
                res.status(controller.signal.aborted ? 504 : 502).json({
                    error: controller.signal.aborted ? 'VPS data API timed out' : 'VPS data API unavailable'
                });
            } else {
                res.destroy();
            }
        }
    });
}

const publicDir = path.join(__dirname, '..', 'public');

app.use(express.static(publicDir, {
    index: false,
    setHeaders(res, filePath) {
        const normalized = filePath.replace(/\\/g, '/');
        if (/\/assets\/.*-[A-Za-z0-9_-]{6,}\.(?:js|css)$/i.test(normalized)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return;
        }
        if (/\/assets\/|\/logos\//i.test(normalized)) {
            res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        }
    }
}));

// FFMPEG Configuration (optional - for transcoding support)
// Priority: 1. System FFmpeg (better Docker DNS support), 2. ffmpeg-static npm package
const { execSync } = require('child_process');

function findFFmpeg() {
    // Try system FFmpeg first (better Docker and Linux compatibility)
    try {
        execSync('ffmpeg -version', { stdio: 'ignore' });
        console.log('FFmpeg binary configured at: ffmpeg (system)');
        return 'ffmpeg';
    } catch (e) {
        // System FFmpeg not in PATH, try common locations
    }

    const commonPaths = [
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/bin/ffmpeg',
        '/snap/bin/ffmpeg'
    ];
    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            console.log('FFmpeg binary configured at:', p);
            return p;
        }
    }

    // Try ffmpeg-static npm package
    try {
        let ffmpegPath = require('ffmpeg-static');
        if (ffmpegPath && ffmpegPath.includes('app.asar')) {
            ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
        }
        if (ffmpegPath && fs.existsSync(ffmpegPath)) {
            console.log('FFmpeg binary configured at:', ffmpegPath);
            return ffmpegPath;
        }
    } catch (err) {
        // Ignored
    }

    console.warn('FFmpeg binary not verified - defaulting to "ffmpeg"');
    return 'ffmpeg';
}

function findFFprobe() {
    // Try system ffprobe first
    try {
        execSync('ffprobe -version', { stdio: 'ignore' });
        console.log('FFprobe binary configured at: ffprobe (system)');
        return 'ffprobe';
    } catch (e) {
        // Not found in system
    }

    const commonPaths = [
        '/usr/bin/ffprobe',
        '/usr/local/bin/ffprobe',
        '/bin/ffprobe',
        '/snap/bin/ffprobe'
    ];
    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            console.log('FFprobe binary configured at:', p);
            return p;
        }
    }

    // Try @ffprobe-installer/ffprobe package
    try {
        const ffprobePath = require('@ffprobe-installer/ffprobe').path;
        if (ffprobePath && fs.existsSync(ffprobePath)) {
            console.log('FFprobe binary configured at:', ffprobePath);
            return ffprobePath;
        }
    } catch (err) {
        // Package not available
    }

    console.warn('FFprobe binary not verified - defaulting to "ffprobe"');
    return 'ffprobe';
}

app.locals.ffmpegPath = findFFmpeg();
app.locals.ffprobePath = findFFprobe();

// Dynamic services loader - collects exports from files in ./services
const services = {};
try {
    const servicesDir = path.join(__dirname, 'services');
    const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.js'));
    for (const file of serviceFiles) {
        const name = file.replace(/\.js$/, '');
        try {
            services[name] = require(path.join(servicesDir, file));
        } catch (e) {
            console.warn(`Failed to load service ${file}:`, e.message);
        }
    }
} catch (e) {
    console.warn('No services directory found or failed to read services:', e.message);
}

// Freeze services object to prevent plugins from mutating shared state
Object.freeze(services);

// Plugin loader: loads any .js file inside server/plugins and calls the
// exported function with (app, services).
// Supports both function exports and object exports with lifecycle hooks.
const loadedPlugins = [];

async function loadPlugins() {
    try {
        const pluginsDir = path.join(__dirname, 'plugins');
        if (fs.existsSync(pluginsDir)) {
            // Sort plugin files alphabetically for deterministic load order
            const pluginFiles = fs.readdirSync(pluginsDir)
                .filter(f => f.endsWith('.js'))
                .sort();

            for (const file of pluginFiles) {
                const pluginPath = path.join(pluginsDir, file);
                try {
                    const plugin = require(pluginPath);

                    // Support both function exports and object exports with lifecycle hooks
                    if (typeof plugin === 'function') {
                        // Direct function export (sync or async)
                        await plugin(app, services);
                        loadedPlugins.push({ name: file, plugin: null });
                        console.log(`✓ Loaded plugin: ${file}`);
                    } else if (plugin && typeof plugin.init === 'function') {
                        // Object export with init/shutdown lifecycle
                        await plugin.init(app, services);
                        loadedPlugins.push({ name: file, plugin });
                        console.log(`✓ Loaded plugin: ${file} (with lifecycle hooks)`);
                    } else {
                        console.warn(`⚠ Plugin ${file} does not export a function or object with init(), skipping.`);
                    }
                } catch (err) {
                    console.error(`✗ Failed to load plugin ${file}:`, err);
                }
            }
        }
    } catch (err) {
        console.warn('Plugin loader failed:', err.message);
    }
}

// Graceful shutdown handler for plugins with shutdown hooks
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down plugins...');
    for (const { name, plugin } of loadedPlugins) {
        if (plugin && typeof plugin.shutdown === 'function') {
            try {
                await plugin.shutdown();
                console.log(`✓ Shutdown plugin: ${name}`);
            } catch (err) {
                console.error(`✗ Error shutting down plugin ${name}:`, err);
            }
        }
    }
    process.exit(0);
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sources', require('./routes/sources'));
app.use('/api/proxy', require('./routes/proxy'));
app.use('/proxy', require('./routes/veloraProxy'));
app.use('/api/velora-proxy', require('./routes/veloraProxy'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/transcode', require('./routes/transcode'));
app.use('/api/remux', require('./routes/remux'));
app.use('/api/probe', require('./routes/probe'));
app.use('/api/subtitle', require('./routes/subtitle'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/history', require('./routes/history'));
app.use('/api/search', require('./routes/search'));
app.use('/api/velora/catalog', require('./routes/veloraCatalog'));
const veloraDataRouter = require('./routes/veloraData');
app.use('/api/velora-db', veloraDataRouter);
veloraCatalogCache.onSnapshotReady(snapshotStatus => {
    const countryPackageCache = veloraDataRouter.buildCountryPackageCache();
    const homeCache = veloraDataRouter.buildHomeCache();
    const entryCount = homeCache.sections.reduce((total, section) => total + section.entries.length, 0);
    console.log(`[Country/package cache] Rebuilt after catalogue ${snapshotStatus.snapshotVersion}: ${countryPackageCache.counts.packages} packages, ${countryPackageCache.counts.memberships} memberships`);
    console.log(`[Home cache] Rebuilt after catalogue ${snapshotStatus.snapshotVersion}: ${homeCache.sections.length} sections, ${entryCount} entries`);
});
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api', require('./routes/packageCovers'));
app.use('/api/country-logos', require('./routes/countryLogos'));

// Retired trial/IP endpoints must not fall through to the SPA HTML response.
app.all([
    '/api/trial-status',
    '/api/trial-increment',
    '/api/admin/trial-reset',
    '/api/admin/trial-whitelist',
    '/api/admin/my-ip'
], (req, res) => res.status(404).json({ error: 'Not found' }));

// Version endpoint
app.get('/api/version', (req, res) => {
    const pkg = require('../package.json');
    res.json({ version: pkg.version });
});

function sendLoginPage(req, res) {
    res.sendFile(path.join(publicDir, 'login.html'));
}

function sendVeloraApp(req, res) {
    res.sendFile(path.join(publicDir, 'index.html'));
}

// The browser owns the JWT in localStorage, so the server cannot determine
// authentication from a plain page request. Always serve the app at `/`; its
// early bootstrap redirects browsers without a token to `/login`.
app.get('/', sendVeloraApp);
app.get('/login', sendLoginPage);

// Backend admin iframe. express.static has index disabled, so serve it explicitly.
app.get('/nodecast-admin/', (req, res) => {
    res.sendFile(path.join(publicDir, 'nodecast-admin', 'index.html'));
});

// Trial mode was removed. All viewers authenticate with username/password.
app.get('/trial', (req, res) => res.redirect(302, '/login'));

// Never return index.html for unhandled /api/* endpoints
app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint API introuvable', path: req.path });
});

// SPA fallback - Velora is the public frontend; Nodecast remains the backend/API engine.
app.get('*', sendVeloraApp);

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

async function onServerStarted(port) {
    console.log(`NodeCast TV server running on http://localhost:${port}`);
    if (USE_VPS_DATA_API) {
        console.log(`[Data] Local development is using the VPS database API at ${VPS_DATA_API_BASE}`);
    }

    // Load plugins
    await loadPlugins().catch(err => {
        console.error('Plugin initialization failed:', err);
    });

    if (USE_VPS_DATA_API) return;

    veloraCatalogCache.startAutoWarmTimer();
    const hasReadyVeloraSnapshot = veloraCatalogCache.hasReadySnapshot();
    if (hasReadyVeloraSnapshot) {
        console.log('[Velora cache] Ready local snapshot found, skipping startup rebuild');
    } else {
        veloraCatalogCache.startWarm({ reason: 'startup' }).promise.catch(console.error);
    }

    // Trigger background sync with delay to allow server to settle
    setTimeout(async () => {
        if (hasReadyVeloraSnapshot) {
            console.log('[Sync] Ready Velora cache found, skipping heavy startup source sync');
        } else {
            await syncService.syncAll().catch(console.error);
        }
        // Start the server-side sync timer after initial sync
        await syncService.startSyncTimer().catch(console.error);

        // Detect hardware acceleration capabilities
        try {
            const hwDetect = require('./services/hwDetect');
            await hwDetect.detect();
        } catch (err) {
            console.warn('Hardware detection failed:', err.message);
        }
    }, 5000);
}

const server = app.listen(PORT, () => {
    onServerStarted(PORT).catch(err => {
        console.error('Server initialization failed:', err);
    });
});

server.once('error', err => {
    console.error(`Server failed to listen on port ${PORT}:`, err);
    process.exitCode = 1;
});

process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});
