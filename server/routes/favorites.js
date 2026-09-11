const express = require('express');
const router = express.Router();
const { favorites, getDb } = require('../db/sqlite');
const { requireAuth } = require('../auth');

const veloraCatalogCache = require('../services/veloraCatalogCache');

// All favorites routes require authentication
router.use(requireAuth);

function resolveCatalogItemFallback(sourceId, itemId, itemType) {
    const action = itemType === 'channel' ? 'live_streams' : itemType === 'series' ? 'series' : 'vod_streams';
    const snapshot = veloraCatalogCache.getSnapshot(action) || [];
    const sid = String(sourceId || '');
    const iid = String(itemId || '');
    return snapshot.find(s => {
        const rowIid = String(s.stream_id ?? s.series_id ?? s.raw_stream_id ?? s.raw_series_id ?? '');
        const rowSid = String(s.source_id ?? '');
        if (sid && rowSid && sid !== rowSid) return false;
        return rowIid === iid;
    });
}

// Get all favorites for current user
router.get('/', async (req, res) => {
    try {
        const { sourceId, itemType } = req.query;
        const items = favorites.getAll(req.user.id, sourceId || null, itemType || null);
        const findCatalogItem = getDb().prepare(`
            SELECT name, stream_icon, category_id, container_extension, data
            FROM playlist_items
            WHERE (source_id = ? OR ? = '') AND item_id = ?
            ORDER BY CASE type WHEN 'live' THEN 0 WHEN 'movie' THEN 1 WHEN 'series' THEN 2 ELSE 3 END
            LIMIT 1
        `);
        res.json(items.map(item => {
            const hasValidName = Boolean(item.name && !['Chaîne favorite', 'Série favorite', 'Film favori'].includes(item.name.trim()));
            if (hasValidName && item.thumb_url && item.package_id) return item;
            
            const sid = String(item.source_id || '');
            const iid = String(item.item_id || '');
            const catalog = findCatalogItem.get(sid, sid, iid);
            let raw = {};
            if (catalog) {
                try { raw = JSON.parse(catalog.data || '{}') || {}; } catch (_) {}
            }
            const snapshotFallback = (!catalog || !catalog.name) ? resolveCatalogItemFallback(sid, iid, item.item_type) : null;
            
            const resolvedName = (hasValidName ? item.name : '') ||
                catalog?.name ||
                snapshotFallback?.name ||
                snapshotFallback?.title ||
                snapshotFallback?.series_name ||
                item.name || '';
            const resolvedThumb = item.thumb_url ||
                catalog?.stream_icon ||
                raw.cover ||
                raw.cover_big ||
                snapshotFallback?.stream_icon ||
                snapshotFallback?.cover ||
                '';
            const resolvedPackage = item.package_id ||
                catalog?.category_id ||
                snapshotFallback?.category_id ||
                '';
            const resolvedGlobal = item.global_stream_id ||
                raw.global_stream_id ||
                snapshotFallback?.global_stream_id ||
                '';
            const resolvedExt = item.container_extension ||
                catalog?.container_extension ||
                snapshotFallback?.container_extension ||
                '';

            return {
                ...item,
                name: resolvedName,
                thumb_url: resolvedThumb,
                package_id: resolvedPackage,
                global_stream_id: resolvedGlobal,
                container_extension: resolvedExt
            };
        }));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add favorite for current user
router.post('/', async (req, res) => {
    try {
        let {
            sourceId, itemId, itemType = 'channel', name, thumbUrl,
            packageId, globalStreamId, containerExtension
        } = req.body;
        
        let cleanSourceId = String(sourceId || '').trim();
        let cleanItemId = String(itemId || '').trim();
        
        if ((!cleanSourceId || !cleanItemId) && globalStreamId) {
            try {
                const decoded = Buffer.from(globalStreamId, 'base64url').toString('utf8');
                const [sId, itId] = decoded.split(':');
                if (sId && !cleanSourceId) cleanSourceId = sId;
                if (itId && !cleanItemId) cleanItemId = itId;
            } catch (_) {}
        }
        
        if (cleanItemId.startsWith('cache:')) {
            cleanItemId = cleanItemId.replace(/^cache:(?:live|movie|series):/, '');
        }

        if (!cleanSourceId || !cleanItemId) {
            return res.status(400).json({ error: 'Source ID and Item ID are required' });
        }
        if (!['channel', 'movie', 'series'].includes(itemType)) {
            return res.status(400).json({ error: 'Invalid favorite item type' });
        }

        let cleanName = String(name || '').trim().slice(0, 500);
        if (!cleanName || ['Chaîne favorite', 'Série favorite', 'Film favori'].includes(cleanName)) {
            const fallback = resolveCatalogItemFallback(cleanSourceId, cleanItemId, itemType);
            if (fallback) {
                cleanName = String(fallback.name || fallback.title || fallback.series_name || '').trim().slice(0, 500);
                if (!thumbUrl && (fallback.stream_icon || fallback.cover)) {
                    thumbUrl = fallback.stream_icon || fallback.cover;
                }
                if (!packageId && fallback.category_id) {
                    packageId = String(fallback.category_id);
                }
            }
        }

        favorites.add(req.user.id, cleanSourceId, cleanItemId, itemType, {
            name: cleanName,
            thumbUrl: String(thumbUrl || '').trim().slice(0, 4000),
            packageId: String(packageId || '').trim().slice(0, 500),
            globalStreamId: String(globalStreamId || '').trim().slice(0, 1000),
            containerExtension: String(containerExtension || '').trim().slice(0, 20)
        });
        res.json({ success: true, name: cleanName });
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

