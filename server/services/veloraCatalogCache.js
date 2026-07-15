/**
 * VPS-local public catalogue snapshots for the Velora frontend.
 *
 * Nodecast's SQLite catalogue remains the source of truth. These JSON snapshots
 * are rebuilt from SQLite so public catalogue reads stay fast and continue to
 * work when a rebuild is running or a snapshot is missing.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { getDb } = require('../db/sqlite');
const { sources } = require('../db');

const cacheDir = path.join(__dirname, '..', '..', 'data', 'velora-cache');
const snapshotsDir = path.join(cacheDir, 'snapshots');
const statusPath = path.join(cacheDir, 'status.json');
const AUTO_WARM_HOURS = Math.max(1, parseInt(process.env.VELORA_CATALOG_WARM_INTERVAL_HOURS, 10) || 24);
const DEFAULT_LIVE_HIDE_NEEDLES = ['hevc', 'h265', 'h.265', 'h 265', 'x265'];
const ACTIONS = [
    'live_categories',
    'live_streams',
    'vod_categories',
    'vod_streams',
    'series_categories',
    'series'
];
const CATEGORY_ACTIONS = ['live_streams', 'vod_streams', 'series'];

let currentSnapshot = null;
let activeWarm = null;
let pendingWarmReason = null;
let autoWarmTimer = null;
let status = readJson(statusPath) || {
    running: false,
    ready: false,
    reason: null,
    startedAt: null,
    completedAt: null,
    error: null,
    snapshotVersion: null,
    counts: {}
};

function ensureDirs() {
    fs.mkdirSync(snapshotsDir, { recursive: true });
}

function readJson(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        console.warn('[Velora cache] Failed to read', filePath, err.message);
        return null;
    }
}

function writeJsonAtomic(filePath, data) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data));
    fs.renameSync(tmpPath, filePath);
}

function writeSnapshotAtomic(filePath, data) {
    const json = JSON.stringify(data);
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const tmpGzipPath = `${filePath}.gz.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, json);
    fs.writeFileSync(tmpGzipPath, zlib.gzipSync(json, { level: 6 }));
    fs.renameSync(tmpPath, filePath);
    fs.renameSync(tmpGzipPath, `${filePath}.gz`);
}

function safePathPart(value) {
    return Buffer.from(String(value ?? ''), 'utf8').toString('base64url');
}

function writeStatus() {
    ensureDirs();
    writeJsonAtomic(statusPath, status);
}

function encodeGlobalId(sourceId, itemId) {
    return Buffer.from(`${sourceId}:${itemId}`).toString('base64url');
}

function getLiveHideNeedles() {
    const custom = String(process.env.VELORA_CATALOG_HIDE_LIVE_NEEDLES || '')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean);
    return [...new Set([...DEFAULT_LIVE_HIDE_NEEDLES, ...custom])];
}

function shouldHidePublicLiveName(name) {
    const normalized = String(name || '').normalize('NFKC').toLowerCase();
    return getLiveHideNeedles().some(needle => normalized.includes(needle));
}

function listCategories(sourceIds, type) {
    if (!sourceIds.length) return [];
    const placeholders = sourceIds.map(() => '?').join(',');
    return getDb().prepare(`
        SELECT source_id, category_id, name as category_name, parent_id
        FROM categories
        WHERE source_id IN (${placeholders}) AND type = ? AND is_hidden = 0
        ORDER BY source_id ASC, name ASC
    `).all(...sourceIds, type).map(category => {
        const globalCategoryId = encodeGlobalId(category.source_id, category.category_id);
        return {
            ...category,
            raw_category_id: category.category_id,
            global_category_id: globalCategoryId,
            category_id: globalCategoryId
        };
    });
}

function listStreams(sourceIds, type) {
    if (!sourceIds.length) return [];
    const placeholders = sourceIds.map(() => '?').join(',');
    return getDb().prepare(`
        SELECT source_id, item_id, name, stream_icon, stream_url, added_at, rating, container_extension, year, category_id, data
        FROM playlist_items
        WHERE source_id IN (${placeholders}) AND type = ? AND is_hidden = 0
        ORDER BY source_id ASC, name ASC
    `).all(...sourceIds, type)
        .filter(item => type !== 'live' || !shouldHidePublicLiveName(item.name))
        .map(item => {
            let data = {};
            try {
                data = JSON.parse(item.data || '{}');
            } catch (_) {
                data = {};
            }
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

function removeEmptyCategories(categories, streams) {
    const populatedIds = new Set(streams.map(stream => String(stream.category_id || '')));
    return categories.filter(category => populatedIds.has(String(category.category_id || '')));
}

function loadSnapshotFromDisk() {
    if (currentSnapshot) return currentSnapshot;
    const snapshotVersion = status.snapshotVersion;
    if (!snapshotVersion) return null;
    const snapshotDir = path.join(snapshotsDir, snapshotVersion);
    const loaded = {};
    for (const action of ACTIONS) {
        const data = readJson(path.join(snapshotDir, `${action}.json`));
        if (!Array.isArray(data)) return null;
        loaded[action] = data;
    }
    currentSnapshot = loaded;
    return currentSnapshot;
}

function getSnapshotFilePath(action, gzip = false) {
    const snapshotVersion = status.snapshotVersion;
    if (!snapshotVersion || !ACTIONS.includes(action)) return null;
    const filePath = path.join(snapshotsDir, snapshotVersion, `${action}.json${gzip ? '.gz' : ''}`);
    return fs.existsSync(filePath) ? filePath : null;
}

function getCategorySnapshotFilePath(action, sourceId, categoryId, gzip = false) {
    const snapshotVersion = status.snapshotVersion;
    if (!snapshotVersion || !CATEGORY_ACTIONS.includes(action)) return null;
    const fileName = `${safePathPart(sourceId)}_${safePathPart(categoryId)}.json${gzip ? '.gz' : ''}`;
    const filePath = path.join(snapshotsDir, snapshotVersion, 'by-category', action, fileName);
    return fs.existsSync(filePath) ? filePath : null;
}

async function getCategorySnapshot(action, sourceId, categoryId) {
    const filePath = getCategorySnapshotFilePath(action, sourceId, categoryId, false);
    if (!filePath) return null;
    try {
        const json = await fs.promises.readFile(filePath, 'utf8');
        const data = JSON.parse(json);
        return Array.isArray(data) ? data : null;
    } catch (err) {
        console.warn('[Velora cache] Failed to read category snapshot', action, sourceId, categoryId, err.message);
        return null;
    }
}

function getSnapshot(action, categoryId = null) {
    const snapshot = loadSnapshotFromDisk();
    if (!snapshot || !Array.isArray(snapshot[action])) return null;
    const data = snapshot[action];
    if (!categoryId || action.endsWith('_categories')) return data;
    return data.filter(item => String(item.category_id) === String(categoryId));
}

function sendSnapshotResponse(req, res, action, categoryId = null) {
    if (categoryId) {
        const data = getSnapshot(action, categoryId);
        if (!data) return false;
        res.set('X-Velora-Catalog-Cache', 'vps-local');
        res.set('Cache-Control', 'private, max-age=60');
        res.json(data);
        return true;
    }

    const acceptsGzip = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
    const gzipPath = acceptsGzip ? getSnapshotFilePath(action, true) : null;
    const plainPath = getSnapshotFilePath(action, false);
    const filePath = gzipPath || plainPath;
    if (!filePath) {
        const data = getSnapshot(action);
        if (!data) return false;
        res.set('X-Velora-Catalog-Cache', 'vps-local');
        res.set('Cache-Control', 'private, max-age=60');
        res.json(data);
        return true;
    }

    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('X-Velora-Catalog-Cache', 'vps-local');
    res.set('Cache-Control', 'private, max-age=60');
    if (gzipPath) {
        res.set('Content-Encoding', 'gzip');
        res.set('Vary', 'Accept-Encoding');
    }
    res.sendFile(filePath);
    return true;
}

function sendCategorySnapshotResponse(req, res, action, sourceId, categoryId) {
    const acceptsGzip = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
    const gzipPath = acceptsGzip ? getCategorySnapshotFilePath(action, sourceId, categoryId, true) : null;
    const plainPath = getCategorySnapshotFilePath(action, sourceId, categoryId, false);
    const filePath = gzipPath || plainPath;
    if (!filePath) return false;

    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('X-Velora-Catalog-Cache', 'vps-local-category');
    res.set('Cache-Control', 'private, max-age=60');
    if (gzipPath) {
        res.set('Content-Encoding', 'gzip');
        res.set('Vary', 'Accept-Encoding');
    }
    res.sendFile(filePath);
    return true;
}

function getStatus() {
    return {
        ...status,
        running: Boolean(activeWarm),
        cacheDir,
        autoWarmHours: AUTO_WARM_HOURS
    };
}

function hasReadySnapshot() {
    const snapshotVersion = status.snapshotVersion;
    if (!status.ready || !snapshotVersion) return false;
    const snapshotDir = path.join(snapshotsDir, snapshotVersion);
    const requiredFiles = [
        path.join(snapshotDir, 'live_categories.json'),
        path.join(snapshotDir, 'live_streams.json.gz'),
        path.join(snapshotDir, 'vod_categories.json'),
        path.join(snapshotDir, 'series_categories.json'),
        path.join(snapshotDir, 'by-category')
    ];
    return requiredFiles.every(filePath => fs.existsSync(filePath));
}

function cleanupOldSnapshots(keepVersion) {
    try {
        for (const entry of fs.readdirSync(snapshotsDir, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name === keepVersion) continue;
            fs.rmSync(path.join(snapshotsDir, entry.name), { recursive: true, force: true });
        }
    } catch (err) {
        console.warn('[Velora cache] Old snapshot cleanup failed:', err.message);
    }
}

function writeCategorySnapshotFiles(versionDir, snapshot) {
    for (const action of CATEGORY_ACTIONS) {
        const grouped = new Map();
        for (const item of snapshot[action]) {
            const sourceId = String(item.source_id ?? '').trim();
            const categoryId = String(item.raw_category_id ?? item.category_id ?? '').trim();
            if (!sourceId || !categoryId) continue;
            const key = `${sourceId}\u0000${categoryId}`;
            const existing = grouped.get(key);
            if (existing) existing.push(item);
            else grouped.set(key, [item]);
        }

        const outDir = path.join(versionDir, 'by-category', action);
        fs.mkdirSync(outDir, { recursive: true });
        for (const [key, rows] of grouped.entries()) {
            const [sourceId, categoryId] = key.split('\u0000');
            const filePath = path.join(outDir, `${safePathPart(sourceId)}_${safePathPart(categoryId)}.json`);
            writeSnapshotAtomic(filePath, rows);
        }
    }
}

async function buildSnapshot(reason) {
    ensureDirs();
    status = {
        ...status,
        running: true,
        reason,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null
    };
    writeStatus();

    const enabledSources = (await sources.getAll())
        .filter(source => source.enabled && (source.type === 'xtream' || source.type === 'm3u'));
    const sourceIds = enabledSources.map(source => source.id);

    const liveStreams = listStreams(sourceIds, 'live');
    await new Promise(resolve => setImmediate(resolve));
    const vodStreams = listStreams(sourceIds, 'movie');
    await new Promise(resolve => setImmediate(resolve));
    const series = listStreams(sourceIds, 'series');
    await new Promise(resolve => setImmediate(resolve));

    const snapshot = {
        live_categories: removeEmptyCategories(listCategories(sourceIds, 'live'), liveStreams),
        live_streams: liveStreams,
        vod_categories: removeEmptyCategories(listCategories(sourceIds, 'movie'), vodStreams),
        vod_streams: vodStreams,
        series_categories: removeEmptyCategories(listCategories(sourceIds, 'series'), series),
        series
    };

    const version = String(Date.now());
    const versionDir = path.join(snapshotsDir, version);
    fs.mkdirSync(versionDir, { recursive: true });
    for (const action of ACTIONS) {
        writeSnapshotAtomic(path.join(versionDir, `${action}.json`), snapshot[action]);
    }
    writeCategorySnapshotFiles(versionDir, snapshot);

    currentSnapshot = snapshot;
    status = {
        running: false,
        ready: true,
        reason,
        startedAt: status.startedAt,
        completedAt: new Date().toISOString(),
        error: null,
        snapshotVersion: version,
        sourceIds,
        counts: Object.fromEntries(ACTIONS.map(action => [action, snapshot[action].length]))
    };
    writeStatus();
    cleanupOldSnapshots(version);
    console.log('[Velora cache] Snapshot ready', status.counts);
    return {
        ...status,
        cacheDir,
        autoWarmHours: AUTO_WARM_HOURS
    };
}

async function warm(options = {}) {
    const reason = options.reason || 'manual';
    if (activeWarm) {
        pendingWarmReason = reason;
        return activeWarm;
    }

    activeWarm = (async () => {
        let nextReason = reason;
        let result = null;
        while (nextReason) {
            pendingWarmReason = null;
            result = await buildSnapshot(nextReason);
            nextReason = pendingWarmReason;
        }
        return result;
    })()
        .catch(err => {
            status = {
                ...status,
                running: false,
                error: err.message,
                completedAt: new Date().toISOString()
            };
            writeStatus();
            console.error('[Velora cache] Snapshot build failed:', err);
            throw err;
        })
        .finally(() => {
            activeWarm = null;
        });
    return activeWarm;
}

function startWarm(options = {}) {
    const started = !activeWarm;
    const queued = Boolean(activeWarm);
    const promise = warm(options);
    return { started, queued, promise, status: getStatus() };
}

function startAutoWarmTimer() {
    if (autoWarmTimer) return;
    const intervalMs = AUTO_WARM_HOURS * 60 * 60 * 1000;
    autoWarmTimer = setInterval(() => {
        startWarm({ reason: 'scheduled' }).promise.catch(() => {});
    }, intervalMs);
    if (typeof autoWarmTimer.unref === 'function') autoWarmTimer.unref();
    console.log(`[Velora cache] Local snapshot timer started: every ${AUTO_WARM_HOURS} hours`);
}

module.exports = {
    getCategorySnapshot,
    getSnapshot,
    getStatus,
    hasReadySnapshot,
    sendCategorySnapshotResponse,
    sendSnapshotResponse,
    startAutoWarmTimer,
    startWarm,
    warm
};
