const express = require('express');
const router = express.Router();
const veloraCatalogCache = require('../services/veloraCatalogCache');
const { sources } = require('../db');

const INVENTORY_KINDS = {
    live: ['live_categories', 'live_streams'],
    vod: ['vod_categories', 'vod_streams'],
    series: ['series_categories', 'series']
};

router.get('/status', (req, res) => {
    res.json(veloraCatalogCache.getStatus());
});

router.get('/inventory', async (req, res) => {
    try {
        const sourceRows = await sources.getAll();
        const sourceNames = new Map(sourceRows.map(source => [String(source.id), source.name || `Source ${source.id}`]));
        const providers = new Map();
        for (const [kind, [categoryAction, streamAction]] of Object.entries(INVENTORY_KINDS)) {
            const categories = veloraCatalogCache.getSnapshot(categoryAction) || [];
            const streams = veloraCatalogCache.getSnapshot(streamAction) || [];
            const counts = new Map();
            streams.forEach(item => {
                const key = `${item.source_id}\u0000${item.raw_category_id ?? ''}`;
                counts.set(key, (counts.get(key) || 0) + 1);
            });
            categories.forEach(category => {
                const sourceId = String(category.source_id ?? '');
                const categoryId = String(category.raw_category_id ?? '');
                if (!sourceId || !categoryId) return;
                if (!providers.has(sourceId)) providers.set(sourceId, {
                    sourceId,
                    name: sourceNames.get(sourceId) || `Source ${sourceId}`,
                    packages: []
                });
                providers.get(sourceId).packages.push({
                    kind,
                    categoryId,
                    name: String(category.category_name || `Package ${categoryId}`),
                    itemCount: counts.get(`${sourceId}\u0000${categoryId}`) || 0
                });
            });
        }
        const result = [...providers.values()].map(provider => ({
            ...provider,
            packages: provider.packages.sort((left, right) => left.name.localeCompare(right.name, 'fr'))
        })).sort((left, right) => left.name.localeCompare(right.name, 'fr'));
        res.set('Cache-Control', 'no-store');
        res.json({ generatedAt: veloraCatalogCache.getStatus().completedAt || null, providers: result });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Unable to build catalogue inventory' });
    }
});

router.get('/inventory/:sourceId/:kind/:categoryId', (req, res) => {
    const actions = INVENTORY_KINDS[req.params.kind];
    if (!actions) return res.status(400).json({ error: 'Unknown catalogue kind' });
    const rows = veloraCatalogCache.getSnapshot(actions[1]) || [];
    const items = rows.filter(item => (
        String(item.source_id) === String(req.params.sourceId) &&
        String(item.raw_category_id ?? '') === String(req.params.categoryId)
    )).map(item => ({
        id: item.raw_stream_id ?? item.raw_series_id ?? item.stream_id ?? item.series_id,
        name: String(item.name || item.title || item.series_name || ''),
        image: String(item.stream_icon || item.cover || ''),
        added: item.added || null
    }));
    res.set('Cache-Control', 'no-store');
    res.json({ sourceId: req.params.sourceId, kind: req.params.kind, categoryId: req.params.categoryId, count: items.length, items });
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
