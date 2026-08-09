const express = require('express');
const router = express.Router();
const veloraCatalogCache = require('../services/veloraCatalogCache');
const { sources } = require('../db');

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
    const items = matching.slice(offset, offset + limit).map(item => ({
        id: item.raw_stream_id ?? item.raw_series_id ?? item.stream_id ?? item.series_id,
        name: String(item.name || item.title || item.series_name || ''),
        image: String(item.stream_icon || item.cover || posterIndex?.get(normalizedPosterTitle(item.name || item.title)) || ''),
        added: item.added || null
    }));
    res.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    res.json({ sourceId: req.params.sourceId, kind: req.params.kind, categoryId: req.params.categoryId,
        count: matching.length, offset, limit, hasMore: offset + items.length < matching.length, items });
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
