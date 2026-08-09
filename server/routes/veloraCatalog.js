const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const veloraCatalogCache = require('../services/veloraCatalogCache');
const { sources } = require('../db');
const { getDb } = require('../db/sqlite');
const xtreamApi = require('../services/xtreamApi');
const { requireAuth, requireAdmin } = require('../auth');

const vodPosterCachePath = path.join(__dirname, '..', '..', 'data', 'vod-poster-cache.json');
const activePosterRefreshes = new Set();

const INVENTORY_KINDS = {
    live: ['live_categories', 'live_streams'],
    vod: ['vod_categories', 'vod_streams'],
    series: ['series_categories', 'series']
};
let inventoryPosterIndex = new Map();
let inventoryPosterIndexVersion = null;

function normalizedPosterTitle(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/^\s*[^-]{1,14}\s+-\s+/, '').replace(/\s+/g, ' ').trim();
}

function readPosterCache() {
    try {
        return JSON.parse(fs.readFileSync(vodPosterCachePath, 'utf8')) || {};
    } catch (_) {
        return {};
    }
}

function writePosterCache(cache) {
    const tmpPath = `${vodPosterCachePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(cache));
    fs.renameSync(tmpPath, vodPosterCachePath);
}

function providerPoster(item) {
    return String(item?.stream_icon || item?.cover || item?.cover_big || item?.movie_image || '').trim();
}

function getInventoryPosterIndex() {
    const version = veloraCatalogCache.getStatus().snapshotVersion || '';
    if (version === inventoryPosterIndexVersion) return inventoryPosterIndex;
    const index = new Map();
    for (const item of veloraCatalogCache.getSnapshot('vod_streams') || []) {
        const poster = String(item.stream_icon || item.cover || item.cover_big || '').trim();
        const title = normalizedPosterTitle(item.name || item.title);
        if (poster && title && !index.has(title)) index.set(title, poster);
    }
    inventoryPosterIndex = index;
    inventoryPosterIndexVersion = version;
    return index;
}

router.get('/status', (req, res) => {
    res.json(veloraCatalogCache.getStatus());
});

router.get('/inventory', async (req, res) => {
    try {
        const sourceRows = await sources.getAll();
        const cachedSourceIds = new Set((veloraCatalogCache.getStatus().sourceIds || []).map(String));
        const providers = sourceRows.filter(source => cachedSourceIds.has(String(source.id))).map(source => ({
            sourceId: String(source.id),
            name: source.name || `Source ${source.id}`
        })).sort((left, right) => left.name.localeCompare(right.name, 'fr'));
        res.set('Cache-Control', 'no-store');
        res.json({ generatedAt: veloraCatalogCache.getStatus().completedAt || null, providers });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Unable to list catalogue providers' });
    }
});

router.get('/inventory/:sourceId', (req, res) => {
    try {
        const sourceId = String(req.params.sourceId);
        const packages = [];
        for (const [kind, [categoryAction, streamAction]] of Object.entries(INVENTORY_KINDS)) {
            const categories = (veloraCatalogCache.getSnapshot(categoryAction) || [])
                .filter(category => String(category.source_id) === sourceId);
            const streams = veloraCatalogCache.getSnapshot(streamAction) || [];
            const counts = new Map();
            streams.forEach(item => {
                if (String(item.source_id) !== sourceId) return;
                const categoryId = String(item.raw_category_id ?? '');
                counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
            });
            categories.forEach(category => {
                const categoryId = String(category.raw_category_id ?? '');
                if (!categoryId) return;
                packages.push({
                    kind,
                    categoryId,
                    name: String(category.category_name || `Package ${categoryId}`),
                    itemCount: counts.get(categoryId) || 0
                });
            });
        }
        res.set('Cache-Control', 'no-store');
        res.json({ sourceId, packages: packages.sort((left, right) => left.name.localeCompare(right.name, 'fr')) });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Unable to list provider packages' });
    }
});

router.get('/inventory/:sourceId/:kind/:categoryId', (req, res) => {
    const actions = INVENTORY_KINDS[req.params.kind];
    if (!actions) return res.status(400).json({ error: 'Unknown catalogue kind' });
    const rows = veloraCatalogCache.getSnapshot(actions[1]) || [];
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const matching = rows.filter(item => (
        String(item.source_id) === String(req.params.sourceId) &&
        String(item.raw_category_id ?? '') === String(req.params.categoryId)
    ));
    const posterIndex = req.params.kind === 'vod' ? getInventoryPosterIndex() : null;
    const posterCount = req.params.kind === 'vod' ? matching.reduce((total, item) => (
        total + (String(item.stream_icon || item.cover || posterIndex?.get(normalizedPosterTitle(item.name || item.title)) || '').trim() ? 1 : 0)
    ), 0) : null;
    const items = matching.slice(offset, offset + limit).map(item => ({
        id: item.raw_stream_id ?? item.raw_series_id ?? item.stream_id ?? item.series_id,
        name: String(item.name || item.title || item.series_name || ''),
        image: String(item.stream_icon || item.cover || posterIndex?.get(normalizedPosterTitle(item.name || item.title)) || ''),
        added: item.added || null
    }));
    res.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    res.json({ sourceId: req.params.sourceId, kind: req.params.kind, categoryId: req.params.categoryId,
        count: matching.length, posterCount, offset, limit, hasMore: offset + items.length < matching.length, items });
});

router.post('/inventory/:sourceId/vod/:categoryId/posters/refresh', requireAuth, requireAdmin, async (req, res) => {
    const sourceId = String(req.params.sourceId);
    const categoryId = String(req.params.categoryId);
    const refreshKey = `${sourceId}:${categoryId}`;
    if (activePosterRefreshes.has(refreshKey)) {
        return res.status(409).json({ error: 'A poster refresh is already running for this package' });
    }

    activePosterRefreshes.add(refreshKey);
    try {
        const source = await sources.getById(sourceId);
        if (!source || source.type !== 'xtream' || !source.enabled) {
            return res.status(404).json({ error: 'Enabled Xtream provider not found' });
        }

        const db = getDb();
        const localRows = db.prepare(`
            SELECT item_id, stream_icon
            FROM playlist_items
            WHERE source_id = ? AND type = 'movie' AND category_id = ? AND is_hidden = 0
        `).all(sourceId, categoryId);
        const localIds = new Set(localRows.map(item => String(item.item_id)));
        const posterCache = readPosterCache();
        const postersBefore = localRows.reduce((total, item) => (
            total + (String(item.stream_icon || posterCache[`${sourceId}:${item.item_id}`] || '').trim() ? 1 : 0)
        ), 0);

        const providerRows = await xtreamApi.createFromSource(source).getVodStreams(categoryId, {
            signal: AbortSignal.timeout(45000)
        });
        if (!Array.isArray(providerRows)) throw new Error('Provider returned a non-array VOD package');

        const posters = new Map();
        for (const item of providerRows) {
            const itemId = String(item?.stream_id ?? '').trim();
            const poster = providerPoster(item);
            if (itemId && poster && !posters.has(itemId)) posters.set(itemId, poster);
        }

        const updatePoster = db.prepare(`
            UPDATE playlist_items
            SET stream_icon = ?
            WHERE source_id = ? AND type = 'movie' AND item_id = ?
        `);
        const persist = db.transaction(entries => {
            let matchedPosters = 0;
            for (const [itemId, poster] of entries) {
                if (localIds.has(itemId)) matchedPosters += 1;
                updatePoster.run(poster, sourceId, itemId);
                posterCache[`${sourceId}:${itemId}`] = poster;
            }
            return matchedPosters;
        });
        const matchedPosters = persist(posters);
        writePosterCache(posterCache);

        const postersAfter = new Set(localRows
            .filter(item => String(item.stream_icon || posterCache[`${sourceId}:${item.item_id}`] || '').trim())
            .map(item => String(item.item_id)));
        for (const itemId of posters.keys()) {
            if (localIds.has(itemId)) postersAfter.add(itemId);
        }

        const warmJob = veloraCatalogCache.startWarm({ reason: `poster-package:${refreshKey}` });
        warmJob.promise.catch(() => {});
        return res.status(202).json({
            ok: true,
            provider: source.name || `Source ${sourceId}`,
            sourceId,
            categoryId,
            movies: localRows.length,
            providerMovies: providerRows.length,
            providerPosters: posters.size,
            matchedPosters,
            postersBefore,
            postersAfter: postersAfter.size,
            addedPosters: Math.max(0, postersAfter.size - postersBefore),
            missingPosters: Math.max(0, localRows.length - postersAfter.size),
            cacheRebuildStarted: warmJob.started
        });
    } catch (error) {
        const status = error?.name === 'TimeoutError' ? 504 : 502;
        return res.status(status).json({ error: error.message || 'Unable to refresh package posters' });
    } finally {
        activePosterRefreshes.delete(refreshKey);
    }
});

router.post('/warm', (req, res) => {
    const job = veloraCatalogCache.startWarm({ reason: 'manual' });
    job.promise.catch(() => {});
    res.status(job.started ? 202 : 200).json({
        ok: true,
        started: job.started,
        message: job.started ? 'Velora local catalogue warm-up started' : 'Velora local catalogue warm-up already running',
        status: veloraCatalogCache.getStatus()
    });
});

module.exports = router;
