/**
 * Route API Express pour les matchs de football
 * GET /api/matches/today
 */

const express = require('express');
const router = express.Router();
const footballService = require('../services/footballService');

/**
 * GET /api/matches/today
 * Récupère la liste des matchs de football télévisés aujourd'hui (France par défaut ou pays sélectionné)
 */
router.get('/today', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';
        const country = req.query.country || req.headers['x-velora-country'] || 'france';
        const result = await footballService.getTodayMatches(country, forceRefresh);

        res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200');
        res.setHeader('X-Cache-Hit', result.cached ? 'HIT' : 'MISS');
        res.setHeader('X-Country', String(result.country?.id || 'france'));
        res.setHeader('X-Country-Name', encodeURIComponent(String(result.country?.name || 'France')));
        res.setHeader('X-Total-Matches', String(result.matches.length));

        // Format attendu : tableau direct d'objets match (100% rétrocompatible)
        return res.json(result.matches);
    } catch (err) {
        console.error('[Matches API] Erreur lors de la récupération des matchs:', err.message);
        return res.status(500).json({
            error: 'FETCH_ERROR',
            message: 'Impossible de récupérer les programmes TV de football du jour'
        });
    }
});

/**
 * POST /api/matches/cache/clear
 * Invalidation manuelle du cache
 */
router.post('/cache/clear', (req, res) => {
    const country = req.query.country || req.body?.country;
    footballService.clearCache(country);
    res.json({ ok: true, message: `Cache mémoire 1h ${country ? `pour ${country}` : 'global'} invalidé avec succès` });
});

module.exports = router;
