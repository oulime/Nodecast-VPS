const express = require('express');
const router = express.Router();
const { favorites, getDb } = require('../db/sqlite');
const { requireAuth } = require('../auth');

// All favorites routes require authentication
router.use(requireAuth);

// Get all favorites for current user
router.get('/', async (req, res) => {
    try {
        const { sourceId, itemType } = req.query;
        const items = favorites.getAll(req.user.id, sourceId || null, itemType || null);
        const findCatalogItem = getDb().prepare(`
            SELECT name, stream_icon, category_id, container_extension, data
            FROM playlist_items
            WHERE source_id = ? AND item_id = ?
            ORDER BY CASE type WHEN 'live' THEN 0 WHEN 'movie' THEN 1 WHEN 'series' THEN 2 ELSE 3 END
            LIMIT 1
        `);
        res.json(items.map(item => {
            if (item.name && item.thumb_url && item.package_id) return item;
            const catalog = findCatalogItem.get(item.source_id, item.item_id);
            if (!catalog) return item;
            let raw = {};
            try { raw = JSON.parse(catalog.data || '{}') || {}; } catch (_) {}
            return {
                ...item,
                name: item.name || catalog.name || '',
                thumb_url: item.thumb_url || catalog.stream_icon || raw.cover || raw.cover_big || '',
                package_id: item.package_id || catalog.category_id || '',
                global_stream_id: item.global_stream_id || raw.global_stream_id || '',
                container_extension: item.container_extension || catalog.container_extension || ''
            };
        }));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add favorite for current user
router.post('/', async (req, res) => {
    try {
        const {
            sourceId, itemId, itemType = 'channel', name, thumbUrl,
            packageId, globalStreamId, containerExtension
        } = req.body;
        if (!sourceId || !itemId) {
            return res.status(400).json({ error: 'Source ID and Item ID are required' });
        }
        if (!['channel', 'movie', 'series'].includes(itemType)) {
            return res.status(400).json({ error: 'Invalid favorite item type' });
        }

        favorites.add(req.user.id, sourceId, itemId, itemType, {
            name: String(name || '').trim().slice(0, 500),
            thumbUrl: String(thumbUrl || '').trim().slice(0, 4000),
            packageId: String(packageId || '').trim().slice(0, 500),
            globalStreamId: String(globalStreamId || '').trim().slice(0, 1000),
            containerExtension: String(containerExtension || '').trim().slice(0, 20)
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Remove favorite for current user
router.delete('/', async (req, res) => {
    try {
        const { sourceId, itemId, itemType = 'channel' } = req.body;
        if (!sourceId || !itemId) {
            return res.status(400).json({ error: 'Source ID and Item ID are required' });
        }

        favorites.remove(req.user.id, sourceId, itemId, itemType);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check if item is favorited by current user
router.get('/check', async (req, res) => {
    try {
        const { sourceId, itemId, itemType = 'channel' } = req.query;
        if (!sourceId || !itemId) {
            return res.status(400).json({ error: 'Source ID and Item ID are required' });
        }

        const isFav = favorites.isFavorite(req.user.id, sourceId, itemId, itemType);
        res.json({ isFavorite: isFav });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

