const express = require('express');
const router = express.Router();
const veloraCatalogCache = require('../services/veloraCatalogCache');

router.get('/status', (req, res) => {
    res.json(veloraCatalogCache.getStatus());
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
