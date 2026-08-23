const express = require('express');
const router = express.Router();
const { getDb } = require('../db/sqlite');
const { requireAuth } = require('../auth');

// Middleware to ensure authentication
router.use(requireAuth);

/**
 * GET /api/history
 * Returns the watch history for the authenticated user
 */
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 20;

        // Clean out any legacy channel/live records from the database
        db.prepare("DELETE FROM watch_history WHERE user_id = ? AND item_type NOT IN ('movie', 'series')").run(userId);

        const rows = db.prepare(`
            SELECT * FROM watch_history 
            WHERE user_id = ? AND item_type IN ('movie', 'series')
            ORDER BY updated_at DESC 
            LIMIT ?
        `).all(userId, limit);

        const history = rows.map(row => ({
            ...row,
            data: JSON.parse(row.data || '{}')
        }));

        res.json(history);
    } catch (err) {
        console.error('[History] Error fetching history:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

/**
 * POST /api/history
 * Saves/updates watch progress for an item
 */
router.post('/', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const { id, type, parentId, progress, duration, data, sourceId } = req.body;

        if (!id || !type) {
            return res.status(400).json({ error: 'Missing required fields (id, type)' });
        }

        // Strictly reject live TV channels
        if (type !== 'movie' && type !== 'series') {
            return res.status(400).json({ error: 'Only movies and series are supported in history' });
        }

        const compositeId = `${userId}:${id}`;
        const timestamp = Date.now();

        // Auto-cleanup: remove items older than 90 days to keep DB fast and compact
        const ninetyDaysAgo = timestamp - (90 * 24 * 60 * 60 * 1000);
        db.prepare('DELETE FROM watch_history WHERE user_id = ? AND updated_at < ?').run(userId, ninetyDaysAgo);

        const stmt = db.prepare(`
            INSERT INTO watch_history (id, user_id, source_id, item_type, item_id, parent_id, progress, duration, updated_at, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                source_id = excluded.source_id,
                progress = excluded.progress,
                duration = excluded.duration,
                updated_at = excluded.updated_at,
                data = excluded.data
        `);

        stmt.run(
            compositeId,
            userId,
            sourceId || null,
            type,
            id.toString(),
            parentId ? parentId.toString() : null,
            progress || 0,
            duration || 0,
            timestamp,
            JSON.stringify(data || {})
        );

        res.json({ success: true, timestamp });
    } catch (err) {
        console.error('[History] Error saving progress:', err);
        res.status(500).json({ error: 'Failed to save progress' });
    }
});

/**
 * DELETE /api/history/:itemId
 * Removes an item and all associated episodes from the user's watch history
 */
router.delete('/:itemId', (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const itemId = String(req.params.itemId).trim();

        const compositeId = `${userId}:${itemId}`;

        const stmt = db.prepare(`
            DELETE FROM watch_history 
            WHERE user_id = ? AND (
                id = ? 
                OR id = ?
                OR item_id = ? 
                OR parent_id = ? 
                OR id LIKE ?
                OR id LIKE ?
                OR id LIKE ?
                OR json_extract(data, '$.streamId') = ?
                OR json_extract(data, '$.seriesId') = ?
                OR json_extract(data, '$.episodeStreamId') = ?
                OR json_extract(data, '$.id') = ?
            )
        `);
        const result = stmt.run(
            userId,
            compositeId,
            itemId,
            itemId,
            itemId,
            `${userId}:%:${itemId}`,
            `${userId}:%:${itemId}:%`,
            `%${itemId}%`,
            itemId,
            itemId,
            itemId,
            itemId
        );

        console.log(`[History] Deleted ${result.changes} rows for item ${itemId} (user ${userId})`);
        res.json({ success: true, changes: result.changes });
    } catch (err) {
        console.error('[History] Error deleting history item:', err);
        res.status(500).json({ error: 'Failed to delete history item' });
    }
});

module.exports = router;
