/**
 * VPS-local public catalogue snapshots for the Velora frontend.
 *
 * Nodecast's SQLite catalogue remains the source of truth. These JSON snapshots
 * are rebuilt from SQLite so public catalogue reads stay fast and continue to
 * work when a rebuild is running or a snapshot is missing.
 */

const fs = require('fs');
const path = require('path');
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

let currentSnapshot = null;
let activeWarm = null;
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

function getSnapshot(action, categoryId = null) {
    const snapshot = loadSnapshotFromDisk();
    if (!snapshot || !Array.isArray(snapshot[action])) return null;
    const data = snapshot[action];
    if (!categoryId || action.endsWith('_categories')) return data;
    return data.filter(item => String(item.category_id) === String(categoryId));
}

function getStatus() {
    return {
        ...status,
        running: Boolean(activeWarm),
        cacheDir,
        autoWarmHours: AUTO_WARM_HOURS
    };
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
        writeJsonAtomic(path.join(versionDir, `${action}.json`), snapshot[action]);
    }

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
    if (activeWarm) return activeWarm;
    const reason = options.reason || 'manual';
    activeWarm = buildSnapshot(reason)
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
    const promise = warm(options);
    return { started, promise, status: getStatus() };
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
    getSnapshot,
    getStatus,
    startAutoWarmTimer,
    startWarm,
    warm
};
