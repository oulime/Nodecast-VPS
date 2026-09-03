const express = require('express');
const router = express.Router();
const db = require('../db');
const { sources } = db;
const { getDb } = require('../db/sqlite'); // Import SQLite
const xtreamApi = require('../services/xtreamApi');
const epgParser = require('../services/epgParser');
const cache = require('../services/cache');
const veloraCatalogCache = require('../services/veloraCatalogCache');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { Readable } = require('stream');

// Default cache max age in hours
const DEFAULT_MAX_AGE_HOURS = 24;
const MEDIA_INFO_CACHE_MS = Math.max(1, parseInt(process.env.VELORA_MEDIA_INFO_CACHE_HOURS, 10) || 168) * 60 * 60 * 1000;
const DEFAULT_REMOTE_CATALOG_BASE = 'https://nodecast.veloravip.net';
const REMOTE_CATALOG_DISABLED = /^(1|true|yes)$/i.test(String(process.env.VELORA_CATALOG_REMOTE_DISABLED || '').trim());
const REMOTE_CATALOG_BASE = String(process.env.VELORA_CATALOG_REMOTE_BASE || DEFAULT_REMOTE_CATALOG_BASE).trim().replace(/\/+$/, '');
const STREAM_PROXY_SETTINGS_CACHE_MS = 60 * 1000;
const STREAM_PROXY_DEBUG = /^(1|true|yes)$/i.test(String(process.env.VELORA_STREAM_PROXY_DEBUG || ''));
const VOD_POSTER_CACHE_PATH = path.join(__dirname, '..', '..', 'data', 'vod-poster-cache.json');
let vodPosterCache = {};
let vodPosterCacheSaveTimer = null;
let localPosterTitleIndex = new Map();
let localPosterTitleIndexVersion = null;

try {
    vodPosterCache = JSON.parse(fs.readFileSync(VOD_POSTER_CACHE_PATH, 'utf8')) || {};
} catch (_) {
    vodPosterCache = {};
}

function scheduleVodPosterCacheSave() {
    if (vodPosterCacheSaveTimer) return;
    vodPosterCacheSaveTimer = setTimeout(() => {
        vodPosterCacheSaveTimer = null;
        fs.promises.mkdir(path.dirname(VOD_POSTER_CACHE_PATH), { recursive: true })
            .then(() => fs.promises.writeFile(VOD_POSTER_CACHE_PATH, JSON.stringify(vodPosterCache)))
            .catch(error => console.warn('[VOD posters] Cache save failed:', error.message));
    }, 250);
    vodPosterCacheSaveTimer.unref?.();
}

function normalizedPosterTitle(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/^\s*[^-]{1,14}\s+-\s+/, '').replace(/\s+/g, ' ').trim();
}

function getLocalPosterTitleIndex() {
    const version = veloraCatalogCache.getStatus().snapshotVersion || '';
    if (version === localPosterTitleIndexVersion) return localPosterTitleIndex;
    const index = new Map();
    for (const item of veloraCatalogCache.getSnapshot('vod_streams') || []) {
        const poster = String(item.stream_icon || item.cover || item.cover_big || '').trim();
        const title = normalizedPosterTitle(item.name || item.title);
        if (poster && title && !index.has(title)) index.set(title, poster);
    }
    localPosterTitleIndex = index;
    localPosterTitleIndexVersion = version;
    return index;
}

function rawVodIdentity(item, routeSourceId) {
    let sourceId = String(item.source_id ?? routeSourceId ?? '').trim();
    let vodId = String(item.raw_stream_id ?? '').trim();
    if (!vodId) {
        const decoded = decodeGlobalId(item.stream_id);
        if (decoded) {
            sourceId = String(decoded.sourceId);
            vodId = String(decoded.itemId);
        } else {
            vodId = String(item.stream_id ?? '').trim();
        }
    }
    return sourceId && vodId ? { sourceId, vodId } : null;
}

async function resolvePlayableSource(sourceId) {
    let source = await sources.getById(sourceId);
    if (!source || !source.enabled) {
        const all = await sources.getAll();
        const active = all.filter(s => s.type === 'xtream' && s.enabled);
        if (active.length === 1) {
            source = active[0];
        } else if (active.length > 1 && sourceId) {
            const byStr = active.find(s => String(s.id) === String(sourceId));
            if (byStr) source = byStr;
        }
    }
    return source;
}

async function enrichRemoteVodPosters(items, routeSourceId, headers) {
    const initiallyMissing = items.map((item, index) => ({ item, index, identity: rawVodIdentity(item, routeSourceId) }))
        .filter(entry => entry.identity && !String(entry.item.stream_icon || entry.item.cover || entry.item.cover_big || '').trim());
    if (!initiallyMissing.length) return items;
    const titleIndex = getLocalPosterTitleIndex();
    for (const entry of initiallyMissing) {
        const poster = titleIndex.get(normalizedPosterTitle(entry.item.name || entry.item.title));
        if (!poster) continue;
        entry.item.stream_icon = poster;
        entry.item.cover = poster;
        entry.item.cover_big = poster;
        vodPosterCache[`${entry.identity.sourceId}:${entry.identity.vodId}`] = poster;
    }
    scheduleVodPosterCacheSave();
    const missing = initiallyMissing.filter(entry => !String(entry.item.stream_icon || entry.item.cover || entry.item.cover_big || '').trim());

    let cursor = 0;
    let changed = false;
    async function worker() {
        while (cursor < missing.length) {
            const entry = missing[cursor++];
            const { sourceId, vodId } = entry.identity;
            const cacheKey = `${sourceId}:${vodId}`;
            let poster = Object.prototype.hasOwnProperty.call(vodPosterCache, cacheKey) ? vodPosterCache[cacheKey] : undefined;
            if (poster === null) poster = undefined;
            if (poster === undefined) {
                try {
                    const url = new URL(`/api/proxy/xtream/${encodeURIComponent(sourceId)}/vod_info`, REMOTE_CATALOG_BASE);
                    url.searchParams.set('vod_id', vodId);
                    const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(2500) });
                    if (response.ok) {
                        const details = await response.json();
                        poster = String(details?.info?.movie_image || details?.info?.cover_big || details?.movie_data?.stream_icon || '').trim();
                        if (poster) {
                            vodPosterCache[cacheKey] = poster;
                            changed = true;
                        } else if (Object.prototype.hasOwnProperty.call(vodPosterCache, cacheKey)) {
                            delete vodPosterCache[cacheKey];
                            changed = true;
                        }
                    }
                } catch (_) {
                    poster = '';
                }
            }
            if (poster) {
                entry.item.stream_icon = poster;
                entry.item.cover = poster;
                entry.item.cover_big = poster;
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(64, missing.length) }, worker));
    if (changed) scheduleVodPosterCacheSave();
    return items;
}

let streamProxySettingsCache = {
    expiresAt: 0,
    userAgent: ''
};

function shouldUseRemoteCatalog() {
    return !REMOTE_CATALOG_DISABLED && Boolean(REMOTE_CATALOG_BASE);
}

async function proxyRemoteCatalog(req, res) {
    if (!shouldUseRemoteCatalog(req)) return false;
    let target;
    try {
        target = new URL(req.originalUrl || req.url, REMOTE_CATALOG_BASE);
        const remote = new URL(REMOTE_CATALOG_BASE);
        const localHost = String(req.get('host') || '').toLowerCase();
        if (remote.host.toLowerCase() === localHost) return false;
    } catch (_) {
        return false;
    }

    try {
        const headers = {};
        for (const name of ['accept', 'authorization', 'x-admin-access-key', 'x-velora-admin-key']) {
            const value = req.get(name);
            if (value) headers[name] = value;
        }
        const upstream = await fetch(target, { headers, cache: 'no-store' });
        if (!upstream.ok) {
            return false;
        }
        let body = Buffer.from(await upstream.arrayBuffer());
        const routeMatch = target.pathname.match(/\/api\/proxy\/xtream\/([^/]+)\/vod_streams$/i);
        const contentType = upstream.headers.get('content-type');
        if (upstream.ok && routeMatch && target.searchParams.has('category_id') && /application\/json/i.test(String(contentType || ''))) {
            try {
                const items = JSON.parse(body.toString('utf8'));
                if (Array.isArray(items)) {
                    await enrichRemoteVodPosters(items, routeMatch[1] === 'all' ? '' : routeMatch[1], headers);
                    body = Buffer.from(JSON.stringify(items));
                }
            } catch (error) {
                console.warn('[VOD posters] Remote catalogue enrichment failed:', error.message);
            }
        }
        res.status(upstream.status);
        res.set('X-Velora-Catalog-Remote', REMOTE_CATALOG_BASE);
        const cacheControl = upstream.headers.get('cache-control');
        if (contentType) res.set('Content-Type', contentType);
        if (cacheControl) res.set('Cache-Control', cacheControl);
        res.send(body);
        return true;
    } catch (err) {
        console.warn('[Velora catalog] Remote VPS catalogue unavailable, using local fallback:', err.message);
        return false;
    }
}

async function getStreamProxyUserAgent() {
    const now = Date.now();
    if (streamProxySettingsCache.userAgent && streamProxySettingsCache.expiresAt > now) {
        return streamProxySettingsCache.userAgent;
    }

    const settings = await db.settings.get();
    const userAgent = db.getUserAgent(settings);
    streamProxySettingsCache = {
        expiresAt: now + STREAM_PROXY_SETTINGS_CACHE_MS,
        userAgent
    };
    return userAgent;
}

function streamProxyDebug(message) {
    if (STREAM_PROXY_DEBUG) {
        console.log(message);
    }
}

function encodeGlobalId(sourceId, itemId) {
    return Buffer.from(`${sourceId}:${itemId}`).toString('base64url');
}

function decodeGlobalId(globalId) {
    const candidates = [globalId];

    try {
        candidates.push(Buffer.from(globalId, 'base64url').toString('utf8'));
    } catch (_) {
        // Not a base64url global id. Fall through to legacy source:item parsing.
    }

    for (const candidate of candidates) {
        const separatorIndex = String(candidate).indexOf(':');
        if (separatorIndex <= 0) continue;

        const sourceId = parseInt(candidate.slice(0, separatorIndex), 10);
        const itemId = candidate.slice(separatorIndex + 1);
        if (Number.isFinite(sourceId) && itemId) {
            return { sourceId, itemId };
        }
    }

    return null;
}

function buildXtreamStreamUrl(source, streamId, type = 'live', container = 'm3u8') {
    const baseUrl = source.url.replace(/\/$/, '');

    if (type === 'live') {
        return `${baseUrl}/live/${source.username}/${source.password}/${streamId}.${container}`;
    }
    if (type === 'movie' || type === 'vod') {
        return `${baseUrl}/movie/${source.username}/${source.password}/${streamId}.${container}`;
    }
    if (type === 'series') {
        return `${baseUrl}/series/${source.username}/${source.password}/${streamId}.${container}`;
    }

    return null;
}

// Helper to get formatted category list from DB
function getCategoriesFromDb(sourceId, type, includeHidden = false) {
    const db = getDb();
    let query = `
        SELECT source_id, category_id, name as category_name, parent_id 
        FROM categories 
        WHERE source_id = ? AND type = ?
    `;
    if (!includeHidden) {
        query += ` AND is_hidden = 0`;
    }
    query += ` ORDER BY name ASC`;
    const cats = db.prepare(query).all(sourceId, type);
    return cats;
}

// Helper to get categories from multiple enabled sources in one response
function getCategoriesFromDbForSources(sourceIds, type, includeHidden = false) {
    if (!sourceIds.length) return [];

    const db = getDb();
    const placeholders = sourceIds.map(() => '?').join(',');
    let query = `
        SELECT source_id, category_id, name as category_name, parent_id
        FROM categories
        WHERE source_id IN (${placeholders}) AND type = ?
    `;
    if (!includeHidden) {
        query += ` AND is_hidden = 0`;
    }
    query += ` ORDER BY source_id ASC, name ASC`;
    return db.prepare(query).all(...sourceIds, type).map(cat => {
        const globalCategoryId = encodeGlobalId(cat.source_id, cat.category_id);
        return {
            ...cat,
            raw_category_id: cat.category_id,
            global_category_id: globalCategoryId,
            category_id: globalCategoryId
        };
    });
}

// Helper to get formatted streams from DB
function getStreamsFromDb(sourceId, type, categoryId = null, includeHidden = false) {
    const db = getDb();
    let cleanCatId = categoryId;
    let cleanSourceId = sourceId;

    if (categoryId && typeof categoryId === 'string' && categoryId.includes(':')) {
        const parts = categoryId.split(':');
        cleanCatId = parts[parts.length - 1];
        if (!cleanSourceId && parts.length >= 2) {
            cleanSourceId = parseInt(parts[0], 10);
        }
    }

    let query = `
        SELECT source_id, item_id, name, stream_icon, stream_url, added_at, rating, container_extension, year, category_id, provider_order, data
        FROM playlist_items 
        WHERE type = ?
    `;
    const params = [type];

    if (cleanSourceId && !isNaN(cleanSourceId)) {
        query += ` AND source_id = ?`;
        params.push(cleanSourceId);
    }

    if (!includeHidden) {
        query += ` AND is_hidden = 0`;
    }

    if (cleanCatId) {
        query += ` AND category_id = ?`;
        params.push(cleanCatId);
    }

    query += ` ORDER BY provider_order ASC, rowid ASC`;

    // Default sorting
    // query += ` ORDER BY name ASC`; // Sorting usually handled by client

    const items = db.prepare(query).all(...params);

    // Map to Xtream format
    return items.map(item => {
        const data = JSON.parse(item.data || '{}');
        // Override with our local fields if needed, or just return the mixed object
        // We should ensure critical fields are present
        return {
            ...data,
            source_id: item.source_id,
            stream_id: item.item_id, // ensure ID matches what client expects
            series_id: type === 'series' ? item.item_id : undefined,
            name: item.name,
            stream_icon: item.stream_icon,
            stream_url: item.stream_url || data.stream_url || data.url,
            cover: item.stream_icon, // series/vod often use cover
            added: item.added_at,
            rating: item.rating,
            container_extension: item.container_extension,
            category_id: item.category_id,
            // Normalize EPG channel ID: Xtream uses epg_channel_id, M3U uses tvgId
            epg_channel_id: data.epg_channel_id || data.tvgId || null
        };
    });
}

// Helper to get formatted streams from multiple enabled sources in one response
function getStreamsFromDbForSources(sourceIds, type, categoryId = null, includeHidden = false) {
    if (!sourceIds.length) return [];

    const db = getDb();
    const placeholders = sourceIds.map(() => '?').join(',');
    let query = `
        SELECT source_id, item_id, name, stream_icon, stream_url, added_at, rating, container_extension, year, category_id, provider_order, data
        FROM playlist_items
        WHERE source_id IN (${placeholders}) AND type = ?
    `;
    const params = [...sourceIds, type];

    if (!includeHidden) {
        query += ` AND is_hidden = 0`;
    }

    if (categoryId) {
        const decodedCategory = decodeGlobalId(categoryId);
        const categoryParts = String(categoryId).split(':');
        if (decodedCategory) {
            query += ` AND source_id = ? AND category_id = ?`;
            params.push(decodedCategory.sourceId, decodedCategory.itemId);
        } else if (categoryParts.length === 2) {
            query += ` AND source_id = ? AND category_id = ?`;
            params.push(parseInt(categoryParts[0]), categoryParts[1]);
        } else {
            query += ` AND category_id = ?`;
            params.push(categoryId);
        }
    }

    query += ` ORDER BY source_id ASC, provider_order ASC, rowid ASC`;

    return db.prepare(query).all(...params).map(item => {
        const data = JSON.parse(item.data || '{}');
        const globalStreamId = encodeGlobalId(item.source_id, item.item_id);
        const globalCategoryId = encodeGlobalId(item.source_id, item.category_id);
        return {
            ...data,
            source_id: item.source_id,
            raw_stream_id: item.item_id,
            global_stream_id: globalStreamId,
            stream_id: globalStreamId,
            raw_series_id: type === 'series' ? item.item_id : undefined,
            series_id: type === 'series' ? globalStreamId : undefined,
            name: item.name,
            stream_icon: item.stream_icon,
            stream_url: item.stream_url || data.stream_url || data.url,
            cover: item.stream_icon,
            added: item.added_at,
            rating: item.rating,
            container_extension: item.container_extension,
            raw_category_id: item.category_id,
            global_category_id: globalCategoryId,
            category_id: globalCategoryId,
            epg_channel_id: data.epg_channel_id || data.tvgId || null
        };
    });
}

async function getEnabledPlaylistSourceIds() {
    const allSources = await sources.getAll();
    return allSources
        .filter(source => source.enabled && (source.type === 'xtream' || source.type === 'm3u'))
        .map(source => source.id);
}

function getContentTypeForAction(action) {
    switch (action) {
        case 'live_categories':
        case 'live_streams':
            return 'live';
        case 'vod_categories':
        case 'vod_streams':
            return 'movie';
        case 'series_categories':
        case 'series':
            return 'series';
        default:
            return null;
    }
}

function sendCachedSourceCategory(req, res, action, sourceId, categoryId, includeHidden) {
    if (includeHidden || !categoryId) return false;
    return veloraCatalogCache.sendCategorySnapshotResponse(req, res, action, sourceId, categoryId);
}

// --- Xtream Codes Proxy API --- //

router.use('/xtream', async (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (await proxyRemoteCatalog(req, res)) return;
    next();
});

// Combined Xtream-style API for every enabled playlist source.
// Example: /api/proxy/xtream/all/live_categories
router.get('/xtream/all/:action', async (req, res) => {
    try {
        const { action } = req.params;
        const includeHidden = req.query.includeHidden === 'true';
        const categoryId = req.query.category_id;
        const type = getContentTypeForAction(action);

        if (!type) {
            return res.status(400).json({ error: 'Unknown action for all sources' });
        }

        if (!includeHidden) {
            if (veloraCatalogCache.sendSnapshotResponse(req, res, action, categoryId)) return;
        }

        const sourceIds = await getEnabledPlaylistSourceIds();
        const data = action.endsWith('_categories')
            ? getCategoriesFromDbForSources(sourceIds, type, includeHidden)
            : getStreamsFromDbForSources(sourceIds, type, categoryId, includeHidden);

        res.json(data);
    } catch (err) {
        console.error('All sources proxy error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Stream URL by global stream id.
// Example: /api/proxy/xtream/stream/MjozMTEzNDk/live?container=m3u8
router.get('/xtream/stream/:globalStreamId/:type?', async (req, res) => {
    try {
        const decoded = decodeGlobalId(req.params.globalStreamId);
        if (!decoded) {
            return res.status(400).json({ error: 'Invalid global stream id' });
        }

        const type = req.params.type || 'live';
        const dbType = type === 'movie' || type === 'vod' ? 'movie' : type;
        const container = req.query.container || 'm3u8';

        const db = getDb();
        const item = db.prepare(`
            SELECT source_id, item_id, stream_url, container_extension
            FROM playlist_items
            WHERE source_id = ? AND item_id = ? AND type = ?
        `).get(decoded.sourceId, decoded.itemId, dbType);

        if (!item) {
            return res.status(404).json({ error: 'Stream not found' });
        }

        const source = await resolvePlayableSource(item.source_id);
        if (!source || !source.enabled) {
            return res.status(404).json({ error: 'Source not found or disabled' });
        }

        if (source.type === 'm3u') {
            if (!item.stream_url) {
                return res.status(404).json({ error: 'Direct stream URL not found' });
            }
            return res.json({
                url: item.stream_url,
                stream_id: req.params.globalStreamId,
                raw_stream_id: item.item_id
            });
        }

        if (source.type !== 'xtream') {
            return res.status(404).json({ error: 'Playable source not found' });
        }

        const streamUrl = buildXtreamStreamUrl(source, item.item_id, type, container || item.container_extension);
        if (!streamUrl) {
            return res.status(400).json({ error: 'Invalid stream type' });
        }

        res.json({
            url: streamUrl,
            stream_id: req.params.globalStreamId,
            raw_stream_id: item.item_id
        });
    } catch (err) {
        console.error('Global stream URL error:', err);
        res.status(500).json({ error: 'Failed to get stream URL' });
    }
});

// Login / Authenticate
router.get('/xtream/:sourceId', async (req, res) => {
    try {
        const source = await sources.getById(req.params.sourceId);
        if (!source || source.type !== 'xtream' || !source.enabled) return res.status(404).send('Source not found or disabled');

        // Proxy auth check to upstream to ensure credentials are still valid

        const cached = cache.get('xtream', source.id, 'auth', 300000);
        if (cached) return res.json(cached);

        const api = xtreamApi.createFromSource(source);
        const data = await api.authenticate();
        cache.set('xtream', source.id, 'auth', data);
        res.json(data);
    } catch (err) {
        res.status(502).json({ error: 'Upstream error', details: err.message });
    }
});

// Live Categories
router.get('/xtream/:sourceId/live_categories', async (req, res) => {
    try {
        const sourceId = parseInt(req.params.sourceId);
        const includeHidden = req.query.includeHidden === 'true';
        const cats = getCategoriesFromDb(sourceId, 'live', includeHidden);
        res.json(cats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Live Streams
// Live Streams
router.get('/xtream/:sourceId/live_streams', async (req, res) => {
    try {
        const sourceId = parseInt(req.params.sourceId);
        const categoryId = req.query.category_id;
        const includeHidden = req.query.includeHidden === 'true';
        if (sendCachedSourceCategory(req, res, 'live_streams', sourceId, categoryId, includeHidden)) return;
        let streams = getStreamsFromDb(sourceId, 'live', categoryId, includeHidden);
        if (!streams || !streams.length) {
            const cacheKey = categoryId ? `live_streams_${categoryId}` : 'live_streams';
            const cached = cache.get('xtream', sourceId, cacheKey, 24 * 60 * 60 * 1000);
            if (cached) return res.json(cached);
            const source = await sources.getById(sourceId);
            if (source && source.type === 'xtream') {
                const api = xtreamApi.createFromSource(source);
                streams = await api.getLiveStreams(categoryId);
                if (Array.isArray(streams)) {
                    cache.set('xtream', sourceId, cacheKey, streams);
                }
            }
        }
        res.json(streams || []);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/xtream/:sourceId/live_streams/:categoryId', async (req, res) => {
    try {
        const sourceId = parseInt(req.params.sourceId);
        const categoryId = req.params.categoryId;
        const includeHidden = req.query.includeHidden === 'true';
        if (sendCachedSourceCategory(req, res, 'live_streams', sourceId, categoryId, includeHidden)) return;
        let streams = getStreamsFromDb(sourceId, 'live', categoryId, includeHidden);
        if (!streams || !streams.length) {
            const cacheKey = categoryId ? `live_streams_${categoryId}` : 'live_streams';
            const cached = cache.get('xtream', sourceId, cacheKey, 24 * 60 * 60 * 1000);
            if (cached) return res.json(cached);
            const source = await sources.getById(sourceId);
            if (source && source.type === 'xtream') {
                const api = xtreamApi.createFromSource(source);
                streams = await api.getLiveStreams(categoryId);
                if (Array.isArray(streams)) {
                    cache.set('xtream', sourceId, cacheKey, streams);
                }
            }
        }
        res.json(streams || []);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// VOD Categories
router.get('/xtream/:sourceId/vod_categories', async (req, res) => {
    try {
        const sourceId = parseInt(req.params.sourceId);
        const includeHidden = req.query.includeHidden === 'true';
        const cats = getCategoriesFromDb(sourceId, 'movie', includeHidden);
        res.json(cats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// VOD Streams
router.get('/xtream/:sourceId/vod_streams', async (req, res) => {
    try {
        const sourceId = parseInt(req.params.sourceId);
        const categoryId = req.query.category_id;
        const includeHidden = req.query.includeHidden === 'true';
        if (sendCachedSourceCategory(req, res, 'vod_streams', sourceId, categoryId, includeHidden)) return;
        let streams = getStreamsFromDb(sourceId, 'movie', categoryId, includeHidden);
        if (!streams || !streams.length) {
            const cacheKey = categoryId ? `vod_streams_${categoryId}` : 'vod_streams';
            const cached = cache.get('xtream', sourceId, cacheKey, 24 * 60 * 60 * 1000);
            if (cached) return res.json(cached);
            const source = await sources.getById(sourceId);
            if (source && source.type === 'xtream') {
                const api = xtreamApi.createFromSource(source);
                streams = await api.getVodStreams(categoryId);
                if (Array.isArray(streams)) {
                    cache.set('xtream', sourceId, cacheKey, streams);
                }
            }
        }
        res.json(streams || []);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/xtream/:sourceId/vod_streams/:categoryId', async (req, res) => {
    try {
        const sourceId = parseInt(req.params.sourceId);
        const categoryId = req.params.categoryId;
        const includeHidden = req.query.includeHidden === 'true';
        if (sendCachedSourceCategory(req, res, 'vod_streams', sourceId, categoryId, includeHidden)) return;
        let streams = getStreamsFromDb(sourceId, 'movie', categoryId, includeHidden);
        if (!streams || !streams.length) {
            const cacheKey = categoryId ? `vod_streams_${categoryId}` : 'vod_streams';
            const cached = cache.get('xtream', sourceId, cacheKey, 24 * 60 * 60 * 1000);
            if (cached) return res.json(cached);
            const source = await sources.getById(sourceId);
            if (source && source.type === 'xtream') {
                const api = xtreamApi.createFromSource(source);
                streams = await api.getVodStreams(categoryId);
                if (Array.isArray(streams)) {
                    cache.set('xtream', sourceId, cacheKey, streams);
                }
            }
        }
        res.json(streams || []);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Series Categories
router.get('/xtream/:sourceId/series_categories', async (req, res) => {
    try {
        const sourceId = parseInt(req.params.sourceId);
        const includeHidden = req.query.includeHidden === 'true';
        const cats = getCategoriesFromDb(sourceId, 'series', includeHidden);
        res.json(cats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Series
router.get('/xtream/:sourceId/series', async (req, res) => {
    try {
        const sourceId = parseInt(req.params.sourceId);
        const categoryId = req.query.category_id;
        const includeHidden = req.query.includeHidden === 'true';
        if (sendCachedSourceCategory(req, res, 'series', sourceId, categoryId, includeHidden)) return;
        const streams = getStreamsFromDb(sourceId, 'series', categoryId, includeHidden);
        res.json(streams);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/xtream/:sourceId/series/:categoryId', async (req, res) => {
    try {
        const sourceId = parseInt(req.params.sourceId);
        const includeHidden = req.query.includeHidden === 'true';
        if (sendCachedSourceCategory(req, res, 'series', sourceId, req.params.categoryId, includeHidden)) return;
        const streams = getStreamsFromDb(sourceId, 'series', req.params.categoryId, includeHidden);
        res.json(streams);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Series Info (Episodes)
// Proxy series info request
router.get('/xtream/:sourceId/series_info', async (req, res) => {
    try {
        const source = await resolvePlayableSource(req.params.sourceId);
        if (!source || !source.enabled) return res.status(404).send('Source not found or disabled');

        const seriesId = req.query.series_id;
        if (!seriesId) return res.status(400).send('series_id required');

        const cacheKey = `series_info_${seriesId}`;
        const cached = cache.get('xtream', source.id, cacheKey, MEDIA_INFO_CACHE_MS);
        if (cached) return res.json(cached);

        const api = xtreamApi.createFromSource(source);
        const data = await api.getSeriesInfo(seriesId);
        if (data && (data.episodes || data.info)) {
            cache.set('xtream', source.id, cacheKey, data);
        }
        res.json(data);
    } catch (err) {
        res.status(502).json({ error: 'Upstream error', details: err.message });
    }
});

// VOD Info
router.get('/xtream/:sourceId/vod_info', async (req, res) => {
    try {
        const source = await resolvePlayableSource(req.params.sourceId);
        if (!source || !source.enabled) return res.status(404).send('Source not found or disabled');

        const vodId = req.query.vod_id;
        if (!vodId) return res.status(400).send('vod_id required');

        const cacheKey = `vod_info_${vodId}`;
        const cached = cache.get('xtream', source.id, cacheKey, MEDIA_INFO_CACHE_MS);
        if (cached) return res.json(cached);

        const api = xtreamApi.createFromSource(source);
        const data = await api.getVodInfo(vodId);
        if (data && (data.info || data.movie_data)) {
            cache.set('xtream', source.id, cacheKey, data);
        }
        res.json(data);
    } catch (err) {
        res.status(502).json({ error: 'Upstream error', details: err.message });
    }
});

// Get Stream URL for playback
// Returns the direct stream URL for a given stream ID
router.get('/xtream/:sourceId/stream/:streamId/:type', async (req, res) => {
    try {
        const source = await resolvePlayableSource(req.params.sourceId);
        if (!source || source.type !== 'xtream' || !source.enabled) {
            return res.status(404).json({ error: 'Xtream source not found or disabled' });
        }

        const streamId = req.params.streamId;
        const type = req.params.type || 'live';
        const container = req.query.container || 'm3u8';

        // Construct the Xtream stream URL
        // Format: http://server:port/live/username/password/streamId.container (for live)
        // Format: http://server:port/movie/username/password/streamId.container (for movie)
        // Format: http://server:port/series/username/password/streamId.container (for series)

        let streamUrl;
        const baseUrl = source.url.replace(/\/$/, ''); // Remove trailing slash

        if (type === 'live') {
            streamUrl = `${baseUrl}/live/${source.username}/${source.password}/${streamId}.${container}`;
        } else if (type === 'movie') {
            streamUrl = `${baseUrl}/movie/${source.username}/${source.password}/${streamId}.${container}`;
        } else if (type === 'series') {
            streamUrl = `${baseUrl}/series/${source.username}/${source.password}/${streamId}.${container}`;
        } else {
            return res.status(400).json({ error: 'Invalid stream type' });
        }

        res.json({ url: streamUrl });
    } catch (err) {
        console.error('Error getting stream URL:', err);
        res.status(500).json({ error: 'Failed to get stream URL' });
    }
});


// --- Other Proxy Routes --- //

// M3U Playlist 
// (For M3U sources, we now have data in DB. We can reconstruct M3U or return JSON)
// Frontend ChannelList.js for M3U sources calls `API.proxy.m3u.get(sourceId)`
// which points here. It expects { channels, groups }.
router.get('/m3u/:sourceId', async (req, res) => {
    try {
        const sourceId = parseInt(req.params.sourceId);
        const includeHidden = req.query.includeHidden === 'true';

        // Fetch from DB
        const channels = getStreamsFromDb(sourceId, 'live', null, includeHidden);
        const groups = getCategoriesFromDb(sourceId, 'live', includeHidden);

        // Format for frontend helper
        // ChannelList expects:
        // { 
        //   channels: [ { id, name, groupTitle, url, tvgLogo, ... } ], 
        //   groups: [ { id, name, channelCount } ] 
        // }
        // Note: DB `live` items from M3U sync have `category_id` as their group name usually.

        const reformattedChannels = channels.map(c => ({
            ...c,
            id: c.stream_id,
            groupTitle: c.category_id || 'Uncategorized',
            url: c.stream_url || c.url,
            tvgLogo: c.stream_icon
        }));

        const reformattedGroups = groups.map(g => ({
            id: g.category_id,
            name: g.category_name,
            channelCount: 0 // Frontend calculates this or we can
        }));

        // Add implicit groups check?
        // The frontend M3U parser generates groups from the channels if explicit groups missing.
        // Our SyncService `saveCategories` handles explicit groups.

        res.json({ channels: reformattedChannels, groups: reformattedGroups });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// EPG
router.get('/epg/:sourceId', async (req, res) => {
    try {
        const sourceId = parseInt(req.params.sourceId);
        const db = getDb();

        // Time window: 24 hours ago to 24 hours from now
        // This prevents returning millions of rows and crashing the server/browser
        const windowStart = Date.now() - (24 * 60 * 60 * 1000); // -24 hours
        const windowEnd = Date.now() + (24 * 60 * 60 * 1000);   // +24 hours

        // Fetch programs within the time window
        let programsQuery = `
            SELECT channel_id as channelId, start_time, end_time, title, description, data 
            FROM epg_programs 
            WHERE source_id = ? AND end_time > ? AND start_time < ?
        `;
        const params = [sourceId, windowStart, windowEnd];

        const programs = db.prepare(programsQuery).all(...params);

        const formattedPrograms = programs.map(p => ({
            channelId: p.channelId,
            start: new Date(p.start_time).toISOString(), // EpgGuide parse this back
            stop: new Date(p.end_time).toISOString(),
            title: p.title,
            description: p.description
        }));

        // Fetch EPG channels from playlist_items (type='epg_channel')


        let epgChannels = [];

        // Try getting stored channels first
        const storedChannels = db.prepare(`
            SELECT item_id as id, name, stream_icon as icon, data 
            FROM playlist_items 
            WHERE source_id = ? AND type = 'epg_channel'
        `).all(sourceId);

        if (storedChannels.length > 0) {
            epgChannels = storedChannels;
        } else {
            // Fallback: Build from unique channelIds in programmes (Legacy behavior)
            const uniqueChannelIds = [...new Set(programs.map(p => p.channelId))];
            epgChannels = uniqueChannelIds.map(id => ({
                id: id,
                name: id // Use channelId as name (fallback)
            }));
        }

        res.json({
            channels: epgChannels,
            programmes: formattedPrograms
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Clear cache (kept for compatibility)
router.delete('/cache/:sourceId', (req, res) => {
    const sourceId = req.params.sourceId;
    cache.clearSource(sourceId);
    res.json({ success: true });
});



/**
 * Proxy Xtream API calls
 * GET /api/proxy/xtream/:sourceId/:action
 */
router.get('/xtream/:sourceId/:action', async (req, res) => {
    try {
        const sourceId = req.params.sourceId;
        const source = await sources.getById(sourceId);
        if (!source || source.type !== 'xtream') {
            return res.status(404).json({ error: 'Xtream source not found' });
        }

        const { action } = req.params;
        const { category_id, stream_id, vod_id, series_id, limit, refresh, maxAge } = req.query;
        const forceRefresh = refresh === '1';
        const maxAgeHours = parseInt(maxAge) || DEFAULT_MAX_AGE_HOURS;
        const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

        // Actions that should be cached
        const cacheableActions = [
            'live_categories', 'live_streams',
            'vod_categories', 'vod_streams',
            'series_categories', 'series'
        ];

        // Build cache key (include category_id if present)
        const cacheKey = category_id ? `${action}_${category_id}` : action;

        // Check cache for cacheable actions
        if (!forceRefresh && cacheableActions.includes(action)) {
            const cached = cache.get('xtream', sourceId, cacheKey, maxAgeMs);
            if (cached) {
                return res.json(cached);
            }
        }

        // Fetch fresh data
        const api = xtreamApi.createFromSource(source);
        let data;
        switch (action) {
            case 'auth':
                data = await api.authenticate();
                break;
            case 'live_categories':
                data = await api.getLiveCategories();
                break;
            case 'live_streams':
                data = await api.getLiveStreams(category_id);
                break;
            case 'vod_categories':
                data = await api.getVodCategories();
                break;
            case 'vod_streams':
                data = await api.getVodStreams(category_id);
                break;
            case 'vod_info':
                data = await api.getVodInfo(vod_id);
                break;
            case 'series_categories':
                data = await api.getSeriesCategories();
                break;
            case 'series':
                data = await api.getSeries(category_id);
                break;
            case 'series_info':
                data = await api.getSeriesInfo(series_id);
                break;
            case 'short_epg':
                data = await api.getShortEpg(stream_id, limit);
                break;
            default:
                return res.status(400).json({ error: 'Unknown action' });
        }

        // Cache the result for cacheable actions
        if (cacheableActions.includes(action)) {
            cache.set('xtream', sourceId, cacheKey, data);
        }

        res.json(data);
    } catch (err) {
        console.error('Xtream proxy error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Get Xtream stream URL
 * GET /api/proxy/xtream/:sourceId/stream/:streamId
 */
router.get('/xtream/:sourceId/stream/:streamId/:type?', async (req, res) => {
    try {
        const source = await resolvePlayableSource(req.params.sourceId);
        if (!source || source.type !== 'xtream' || !source.enabled) {
            return res.status(404).json({ error: 'Xtream source not found or disabled' });
        }

        const api = xtreamApi.createFromSource(source);
        const { streamId, type = 'live' } = req.params;
        const { container = 'm3u8' } = req.query;

        const url = api.buildStreamUrl(streamId, type, container);
        res.json({ url });
    } catch (err) {
        console.error('Stream URL error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Fetch and parse EPG (with file-based caching)
 * GET /api/proxy/epg/:sourceId
 * Query params:
 *   - refresh=1  Force refresh, bypass cache
 *   - maxAge=N   Max cache age in hours (default 24)
 */
router.get('/epg/:sourceId', async (req, res) => {
    try {
        const sourceId = req.params.sourceId;
        const source = await sources.getById(sourceId);
        if (!source || (source.type !== 'epg' && source.type !== 'xtream')) {
            return res.status(404).json({ error: 'Valid EPG source not found' });
        }

        const forceRefresh = req.query.refresh === '1';
        const maxAgeHours = parseInt(req.query.maxAge) || DEFAULT_MAX_AGE_HOURS;
        const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

        // Check file cache (unless force refresh)
        if (!forceRefresh) {
            const cached = cache.get('epg', sourceId, 'data', maxAgeMs);
            if (cached) {
                return res.json(cached);
            }
        }

        // Fetch fresh data
        let url = source.url;
        if (source.type === 'xtream') {
            const api = xtreamApi.createFromSource(source);
            url = api.getXmltvUrl();
        }

        const data = await epgParser.fetchAndParse(url);

        // Store in file cache
        cache.set('epg', sourceId, 'data', data);

        res.json(data);
    } catch (err) {
        console.error('EPG proxy error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Clear cache for a source
 * DELETE /api/proxy/cache/:sourceId
 */
router.delete('/cache/:sourceId', (req, res) => {
    const sourceId = req.params.sourceId;
    cache.clearSource(sourceId);
    res.json({ success: true });
});

/**
 * Clear EPG cache for a source (legacy endpoint, calls clearSource)
 * DELETE /api/proxy/epg/:sourceId/cache
 */
router.delete('/epg/:sourceId/cache', (req, res) => {
    const sourceId = req.params.sourceId;
    cache.clear('epg', sourceId, 'data');
    res.json({ success: true });
});

/**
 * Get EPG for specific channels
 * POST /api/proxy/epg/:sourceId/channels
 */
router.post('/epg/:sourceId/channels', async (req, res) => {
    try {
        const source = await sources.getById(req.params.sourceId);
        if (!source || source.type !== 'epg') {
            return res.status(404).json({ error: 'EPG source not found' });
        }

        const { channelIds } = req.body;
        if (!channelIds || !Array.isArray(channelIds)) {
            return res.status(400).json({ error: 'channelIds array required' });
        }

        const data = await epgParser.fetchAndParse(source.url);

        // Filter programmes for requested channels
        const result = {};
        for (const channelId of channelIds) {
            result[channelId] = epgParser.getCurrentAndUpcoming(data.programmes, channelId);
        }

        res.json(result);
    } catch (err) {
        console.error('EPG channels error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Proxy stream for playback
 * This handles CORS for streams that don't allow cross-origin
 * Supports HTTP Range requests for video seeking and live HLS manifest deduplication/resilience
 */
const liveManifestCache = new Map();
const LIVE_MANIFEST_CACHE_TTL_MS = 1200;
const LIVE_MANIFEST_STALE_TTL_MS = 10000;

router.get('/stream', async (req, res) => {
    const maxRetries = 4;
    const retryDelays = [250, 600, 1200, 2000];
    let lastError = null;

    let { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL required' });
    }

    const isM3u8Url = /\.m3u8(\?|$)/i.test(url);

    // Fast-path: return freshly cached live manifest to avoid hammering upstream IPTV server concurrently
    if (isM3u8Url && liveManifestCache.has(url)) {
        const cached = liveManifestCache.get(url);
        if (Date.now() - cached.timestamp < LIVE_MANIFEST_CACHE_TTL_MS) {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('X-Accel-Buffering', 'no');
            res.set('Content-Type', 'application/vnd.apple.mpegurl');
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.set('X-Velora-Manifest-Cache', 'HIT');
            return res.send(cached.manifest);
        }
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const abortController = new AbortController();
            let activeResponse = null;
            const onClose = () => {
                try {
                    abortController.abort();
                } catch {}
                try {
                    activeResponse?.body?.cancel?.();
                } catch {}
            };
            req.on('close', onClose);

            // Forward headers to origin
            const plutoDomains = ['pluto.tv', 'pluto.io', 'plutotv.net', 'siloh.pluto.tv', 'service-stitcher'];
            const isPluto = plutoDomains.some(domain => url.includes(domain));
            const userAgent = await getStreamProxyUserAgent();

            const isIptvStream = /\/(live|movie|series|hls)\//i.test(url) || /\.(m3u8|ts|mp4|mkv)(\?|$)/i.test(url);

            const headers = {
                'User-Agent': userAgent || 'VLC/3.0.18 LibVLC/3.0.18',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9'
            };

            // Only send Origin/Referer when required (Pluto or non-IPTV).
            // IPTV / Xtream servers often block/rate-limit requests that send browser Origin/Referer.
            if (isPluto) {
                headers['Origin'] = 'https://pluto.tv';
                headers['Referer'] = 'https://pluto.tv/';
            } else if (!isIptvStream) {
                try {
                    const parsedUrl = new URL(url);
                    headers['Origin'] = parsedUrl.origin;
                    headers['Referer'] = parsedUrl.origin + '/';
                } catch {}
            }

            // Forward Range header for video seeking support
            const rangeHeader = req.get('range');
            if (rangeHeader) {
                headers['Range'] = rangeHeader;
            }

            const response = await fetch(url, { headers, signal: abortController.signal });
            activeResponse = response;

            // Retry on 5xx errors or transient burst rate limits (458, 429)
            if ((response.status >= 500 || response.status === 458 || response.status === 429) && attempt < maxRetries) {
                const delay = retryDelays[attempt - 1] || 800;
                console.log(`[Proxy] Upstream transient status ${response.status} for ${url.substring(0, 60)} (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            if (!response.ok) {
                // If upstream failed with 458/429/5xx and we have a stale manifest, serve it to prevent player stutter
                if (isM3u8Url && liveManifestCache.has(url)) {
                    const cached = liveManifestCache.get(url);
                    if (Date.now() - cached.timestamp < LIVE_MANIFEST_STALE_TTL_MS) {
                        req.off('close', onClose);
                        res.set('Access-Control-Allow-Origin', '*');
                        res.set('X-Accel-Buffering', 'no');
                        res.set('Content-Type', 'application/vnd.apple.mpegurl');
                        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
                        res.set('X-Velora-Manifest-Fallback', 'STALE_200');
                        return res.send(cached.manifest);
                    }
                }
                req.off('close', onClose);
                console.error(`Upstream error for ${url.substring(0, 80)}...: ${response.status} ${response.statusText}`);
                if (response.status === 403) {
                    const errorBody = await response.text().catch(() => 'N/A');
                    console.error(`403 Response body: ${errorBody.substring(0, 200)}`);
                }
                return res.status(response.status).send(`Failed to fetch stream: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || '';
            res.set('Access-Control-Allow-Origin', '*');
            res.set('X-Accel-Buffering', 'no');

            // Forward range-related headers for video seeking support
            const contentLength = response.headers.get('content-length');
            const contentRange = response.headers.get('content-range');
            const acceptRanges = response.headers.get('accept-ranges');
            const upstreamCacheControl = response.headers.get('cache-control');

            if (contentLength) {
                res.set('Content-Length', contentLength);
            }
            if (contentRange) {
                res.set('Content-Range', contentRange);
            }
            if (acceptRanges) {
                res.set('Accept-Ranges', acceptRanges);
            } else if (contentLength && !contentRange) {
                res.set('Accept-Ranges', 'bytes');
            }
            if (upstreamCacheControl) {
                res.set('Cache-Control', upstreamCacheControl);
            }

            // Set status code (206 for partial content when range request was made)
            res.status(response.status);

            // Create an async iterator for the response body
            const iterator = response.body[Symbol.asyncIterator]();
            const first = await iterator.next();

            if (first.done) {
                res.set('Content-Type', contentType || 'application/octet-stream');
                req.off('close', onClose);
                return res.end();
            }

            const firstChunk = Buffer.from(first.value);

            // Peek at first bytes to check for HLS manifest ({ #EXTM3U })
            const textPrefix = firstChunk.subarray(0, 7).toString('utf8');
            const responseUrl = response.url || url;
            const responseUrlObj = new URL(responseUrl);
            const responseUrlPath = responseUrlObj.pathname + responseUrlObj.search;
            const contentLooksLikeHls =
                textPrefix === '#EXTM3U' ||
                firstChunk.toString('utf8', 0, Math.min(firstChunk.length, 32)).trimStart().startsWith('#EXTM3U') ||
                contentType.toLowerCase().includes('mpegurl') ||
                /\.m3u8(\?|$)/i.test(responseUrlPath);

            if (contentLooksLikeHls) {
                // HLS Manifest: We must read the WHOLE manifest to rewrite it
                const chunks = [firstChunk];

                // Consume the rest of the stream
                let result = await iterator.next();
                while (!result.done) {
                    chunks.push(Buffer.from(result.value));
                    result = await iterator.next();
                }

                const buffer = Buffer.concat(chunks);
                const finalUrl = response.url || url;
                streamProxyDebug(`[Proxy] Processing HLS manifest from: ${finalUrl.substring(0, 80)}...`);
                res.removeHeader('Content-Length');
                res.removeHeader('Content-Range');
                res.set('Content-Type', 'application/vnd.apple.mpegurl');
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate');

                let manifest = buffer.toString('utf-8');

                const finalUrlObj = new URL(finalUrl);
                const baseUrl = finalUrlObj.origin + finalUrlObj.pathname.substring(0, finalUrlObj.pathname.lastIndexOf('/') + 1);

                const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
                const host = req.get('x-forwarded-host') || req.get('host');
                const baseUrlPrefix = `${proto}://${host}${req.baseUrl}/stream?url=`;

                manifest = manifest.split('\n').map(line => {
                    const trimmed = line.trim();
                    if (trimmed === '' || trimmed.startsWith('#')) {
                        // Handle both URI="..." and URI='...' formats
                        if (trimmed.includes('URI=')) {
                            return line.replace(/URI=["']([^"']+)["']/g, (match, p1) => {
                                try {
                                    const absoluteUrl = new URL(p1, baseUrl).href;
                                    return `URI="${baseUrlPrefix}${encodeURIComponent(absoluteUrl)}"`;
                                } catch (e) {
                                    return match;
                                }
                            });
                        }
                        return line;
                    }

                    // Stream URL handling
                    try {
                        let absoluteUrl;
                        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                            absoluteUrl = trimmed;
                        } else {
                            absoluteUrl = new URL(trimmed, baseUrl).href;
                        }
                        return `${baseUrlPrefix}${encodeURIComponent(absoluteUrl)}`;
                    } catch (e) { return line; }
                }).join('\n');

                // Cache rewritten live manifest for short deduplication
                liveManifestCache.set(url, {
                    manifest,
                    timestamp: Date.now()
                });
                if (liveManifestCache.size > 200) {
                    const now = Date.now();
                    for (const [k, v] of liveManifestCache.entries()) {
                        if (now - v.timestamp > 30000) liveManifestCache.delete(k);
                    }
                }

                req.off('close', onClose);
                return res.send(manifest);
            }

            // Binary/media content: stream through without full buffering.
            streamProxyDebug(`[Proxy] Serving binary content (${contentType})`);
            res.set('Content-Type', contentType || 'application/octet-stream');
            if (!res.write(firstChunk)) {
                await new Promise(resolve => res.once('drain', resolve));
            }

            let result = await iterator.next();
            while (!result.done) {
                if (req.destroyed || res.destroyed || res.writableEnded) {
                    try { response.body?.cancel?.(); } catch {}
                    break;
                }
                if (!res.write(Buffer.from(result.value))) {
                    await new Promise(resolve => res.once('drain', resolve));
                }
                result = await iterator.next();
            }
            req.off('close', onClose);
            res.end();
            return; // Success - exit the retry loop

        } catch (err) {
            lastError = err;
            if (err.name === 'AbortError' || req.destroyed || res.destroyed || res.writableEnded) {
                return;
            }
            console.error(`Stream proxy error (attempt ${attempt}/${maxRetries}):`, err.message);
            if (res.headersSent) {
                return;
            }
            if (attempt < maxRetries) {
                const delay = retryDelays[attempt - 1] || 500;
                console.log(`[Proxy] Retrying after error in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
        }
    }

    // All retries failed
    if (!res.headersSent && !res.destroyed && !res.writableEnded) {
        res.status(500).json({ error: lastError?.message || 'Stream proxy failed after retries' });
    }
});

/**
 * Proxy images (channel logos, posters)
 * Fixes mixed content errors when loading HTTP images on HTTPS pages
 * GET /api/proxy/image?url=...
 */
const TRANSPARENT_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

router.get('/image', async (req, res) => {
    try {
        const url = String(req.query.url || '').trim();
        if (!url) {
            res.set('Content-Type', 'image/png');
            return res.send(TRANSPARENT_PNG);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/*,*/*;q=0.8'
                }
            });
            clearTimeout(timeout);

            if (!response.ok) {
                res.set('Content-Type', 'image/png');
                res.set('Cache-Control', 'public, max-age=3600');
                return res.send(TRANSPARENT_PNG);
            }

            const contentType = response.headers.get('content-type') || 'image/png';
            res.set('Content-Type', contentType);
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

            if (response.body) {
                const stream = Readable.from(response.body);
                stream.pipe(res);
            } else {
                res.end();
            }
        } catch (fetchErr) {
            clearTimeout(timeout);
            res.set('Content-Type', 'image/png');
            res.set('Cache-Control', 'public, max-age=1800');
            return res.send(TRANSPARENT_PNG);
        }
    } catch (err) {
        res.set('Content-Type', 'image/png');
        return res.send(TRANSPARENT_PNG);
    }
});

const personAvatarCache = new Map();
const PERSON_CACHE_FILE = path.join(__dirname, '..', '..', 'data', 'person-avatar-cache.json');
let diskPersonAvatarCache = {};
try {
    diskPersonAvatarCache = JSON.parse(fs.readFileSync(PERSON_CACHE_FILE, 'utf8')) || {};
} catch (_) {
    diskPersonAvatarCache = {};
}

let personCacheSaveTimer = null;
function schedulePersonCacheSave() {
    if (personCacheSaveTimer) return;
    personCacheSaveTimer = setTimeout(() => {
        personCacheSaveTimer = null;
        fs.promises.mkdir(path.dirname(PERSON_CACHE_FILE), { recursive: true })
            .then(() => fs.promises.writeFile(PERSON_CACHE_FILE, JSON.stringify(diskPersonAvatarCache)))
            .catch(e => console.warn('[Person cache] Save failed:', e.message));
    }, 1000);
    personCacheSaveTimer.unref?.();
}

/**
 * Get person / actor avatar photo
 * GET /api/proxy/person_avatar?name=...
 */
router.get('/person_avatar', async (req, res) => {
    try {
        const rawName = String(req.query.name || '').trim();
        if (!rawName) return res.status(400).json({ error: 'Name required' });

        const normName = rawName.toLowerCase();
        if (personAvatarCache.has(normName)) {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Cache-Control', 'public, max-age=604800');
            return res.json({ name: rawName, avatarUrl: personAvatarCache.get(normName) });
        }
        if (diskPersonAvatarCache[normName] !== undefined) {
            personAvatarCache.set(normName, diskPersonAvatarCache[normName]);
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Cache-Control', 'public, max-age=604800');
            return res.json({ name: rawName, avatarUrl: diskPersonAvatarCache[normName] });
        }

        let avatarUrl = null;

        // 1. Try Wikipedia pageimages API
        try {
            const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(rawName)}&prop=pageimages&format=json&pithumbsize=280`;
            const wikiRes = await fetch(wikiUrl, {
                headers: { 'User-Agent': 'VeloraVIP/1.0 (https://veloravip.net)' },
                signal: AbortSignal.timeout(3500)
            });
            if (wikiRes.ok) {
                const data = await wikiRes.json();
                const pages = data?.query?.pages || {};
                const firstPage = Object.values(pages)[0];
                if (firstPage?.thumbnail?.source) {
                    avatarUrl = firstPage.thumbnail.source;
                }
            }
        } catch (_) {}

        // 2. Fallback to TMDB search person API
        if (!avatarUrl) {
            try {
                const tmdbKey = '1bfb17a7415aa804869e2dac761b7192';
                const tmdbUrl = `https://api.themoviedb.org/3/search/person?api_key=${tmdbKey}&query=${encodeURIComponent(rawName)}&language=fr-FR`;
                const tmdbRes = await fetch(tmdbUrl, { signal: AbortSignal.timeout(3500) });
                if (tmdbRes.ok) {
                    const data = await tmdbRes.json();
                    const person = (data?.results || []).find(p => p.profile_path);
                    if (person && person.profile_path) {
                        avatarUrl = `https://image.tmdb.org/t/p/w185${person.profile_path}`;
                    }
                }
            } catch (_) {}
        }

        personAvatarCache.set(normName, avatarUrl);
        diskPersonAvatarCache[normName] = avatarUrl;
        schedulePersonCacheSave();

        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'public, max-age=604800'); // 7 days
        res.json({ name: rawName, avatarUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
