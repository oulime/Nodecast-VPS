const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const veloraCatalogCache = require('../services/veloraCatalogCache');
const { sources } = require('../db');
const { getDb } = require('../db/sqlite');
const xtreamApi = require('../services/xtreamApi');
const { requireAuth } = require('../auth');
const auth = require('../auth');
const paidUsersStore = require('../services/paidUsersStore');

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

function settingsAdminCredentialsAreValid(username, password) {
    const expectedUsername = String(process.env.VITE_ADMIN_USERNAME || 'admin');
    const expectedPassword = String(process.env.VITE_ADMIN_PASSWORD || '131313');
    const sentUsername = Buffer.from(String(username || ''));
    const sentPassword = Buffer.from(String(password || ''));
    const userBytes = Buffer.from(expectedUsername);
    const passwordBytes = Buffer.from(expectedPassword);
    return sentUsername.length === userBytes.length && sentPassword.length === passwordBytes.length
        && crypto.timingSafeEqual(sentUsername, userBytes)
        && crypto.timingSafeEqual(sentPassword, passwordBytes);
}

function catalogAdminSecret() {
    return String(process.env.JWT_SECRET || 'keyboard cat');
}

function signCatalogAdminToken(userId) {
    const payload = Buffer.from(JSON.stringify({
        userId: String(userId),
        expiresAt: Date.now() + (4 * 60 * 60 * 1000)
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', catalogAdminSecret()).update(payload).digest('base64url');
    return `${payload}.${signature}`;
}

function requireSettingsAdmin(req, res, next) {
    if (req.user?.role === 'admin') return next();
    const token = String(req.get('x-velora-catalog-admin') || '');
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return res.status(403).json({ error: 'Settings Admin session required' });
    const expected = crypto.createHmac('sha256', catalogAdminSecret()).update(payload).digest('base64url');
    const sentBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (sentBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(sentBytes, expectedBytes)) {
        return res.status(403).json({ error: 'Invalid Settings Admin session' });
    }
    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (String(claims.userId) !== String(req.user?.id) || Number(claims.expiresAt) <= Date.now()) {
            return res.status(403).json({ error: 'Expired Settings Admin session' });
        }
    } catch (_) {
        return res.status(403).json({ error: 'Invalid Settings Admin session' });
    }
    next();
}

const PAID_PLAN_MONTHS = new Set([1, 3, 6, 12, 24]);
const PAID_PLAN_MINUTES = new Set([1, 10]);

function paidPlanMonths(value) {
    const months = Number.parseInt(value, 10);
    if (!PAID_PLAN_MONTHS.has(months)) throw new Error('Period must be 1, 3, 6, 12, or 24 months');
    return months;
}

function addPaidMonths(date, months) {
    const next = new Date(date.getTime());
    const day = next.getDate();
    next.setMonth(next.getMonth() + months);
    if (next.getDate() !== day) next.setDate(0);
    return next;
}

function paidPlan(body) {
    if (Object.prototype.hasOwnProperty.call(body || {}, 'subscriptionPlanMinutes')) {
        const minutes = Number.parseInt(body.subscriptionPlanMinutes, 10);
        if (!PAID_PLAN_MINUTES.has(minutes)) throw new Error('Period must be 1 or 10 minutes');
        return { subscriptionPlanMinutes: minutes, subscriptionPlanMonths: null, milliseconds: minutes * 60 * 1000 };
    }
    const months = paidPlanMonths(body?.subscriptionPlanMonths || 1);
    return { subscriptionPlanMinutes: null, subscriptionPlanMonths: months, months };
}

function addPaidPlan(date, plan) {
    return plan.months ? addPaidMonths(date, plan.months) : new Date(date.getTime() + plan.milliseconds);
}

function paidText(value, maxLength = 160) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text ? text.slice(0, maxLength) : null;
}

function paidSubscriptionStatus(user) {
    if (user.subscriptionBlocked) return 'blocked';
    if (!user.subscriptionStart && !user.subscriptionEnd && (user.subscriptionPlanMinutes || user.subscriptionPlanMonths)) return 'pending';
    const end = user.subscriptionEnd ? new Date(user.subscriptionEnd) : null;
    return end && Number.isFinite(end.getTime()) && end.getTime() <= Date.now() ? 'expired' : 'active';
}

function publicPaidUser(user) {
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return { ...safe, subscriptionStatus: paidSubscriptionStatus(safe) };
}

function paidAdminHandler(handler) {
    return (req, res, next) => { void Promise.resolve(handler(req, res, next)).catch(next); };
}

router.get('/admin/paid-users', requireAuth, requireSettingsAdmin, paidAdminHandler(async (req, res) => {
    const users = await paidUsersStore.getAll();
    res.set('Cache-Control', 'no-store');
    res.json(users.filter(user => user.role !== 'admin').map(publicPaidUser));
}));

router.post('/admin/paid-users', requireAuth, requireSettingsAdmin, paidAdminHandler(async (req, res) => {
    const username = paidText(req.body?.username, 80);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const plan = paidPlan(req.body);
    const user = await paidUsersStore.create({
        username,
        passwordHash: await auth.hashPassword(password),
        role: 'viewer',
        displayName: paidText(req.body?.displayName),
        subscriptionStart: null,
        subscriptionEnd: null,
        subscriptionPlanMonths: plan.subscriptionPlanMonths,
        subscriptionPlanMinutes: plan.subscriptionPlanMinutes,
        subscriptionBlocked: false
    });
    res.status(201).json(publicPaidUser(user));
}));

router.put('/admin/paid-users/:id', requireAuth, requireSettingsAdmin, paidAdminHandler(async (req, res) => {
    const existing = await paidUsersStore.getById(req.params.id);
    if (!existing || existing.role === 'admin') return res.status(404).json({ error: 'User not found' });
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'displayName')) updates.displayName = paidText(req.body.displayName);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'username')) {
        updates.username = paidText(req.body.username, 80);
        if (!updates.username) return res.status(400).json({ error: 'Username is required' });
    }
    if (req.body?.password) {
        if (String(req.body.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
        updates.passwordHash = await auth.hashPassword(String(req.body.password));
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'subscriptionBlocked')) updates.subscriptionBlocked = Boolean(req.body.subscriptionBlocked);
    res.json(publicPaidUser(await paidUsersStore.update(req.params.id, updates)));
}));

router.post('/admin/paid-users/:id/renew', requireAuth, requireSettingsAdmin, paidAdminHandler(async (req, res) => {
    const existing = await paidUsersStore.getById(req.params.id);
    if (!existing || existing.role === 'admin') return res.status(404).json({ error: 'User not found' });
    const plan = paidPlan(req.body);
    const now = new Date();
    const currentEnd = existing.subscriptionEnd ? new Date(existing.subscriptionEnd) : null;
    const start = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
    const user = await paidUsersStore.update(req.params.id, {
        subscriptionStart: existing.subscriptionStart || now.toISOString(),
        subscriptionEnd: addPaidPlan(start, plan).toISOString(),
        subscriptionPlanMonths: plan.subscriptionPlanMonths,
        subscriptionPlanMinutes: plan.subscriptionPlanMinutes,
        subscriptionBlocked: false
    });
    res.json(publicPaidUser(user));
}));

router.delete('/admin/paid-users/:id', requireAuth, requireSettingsAdmin, paidAdminHandler(async (req, res) => {
    const existing = await paidUsersStore.getById(req.params.id);
    if (!existing || existing.role === 'admin') return res.status(404).json({ error: 'User not found' });
    await paidUsersStore.delete(req.params.id);
    res.json({ success: true });
}));

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

router.post('/admin-session', requireAuth, (req, res) => {
    if (!settingsAdminCredentialsAreValid(req.body?.username, req.body?.password)) {
        return res.status(403).json({ error: 'Invalid Settings Admin credentials' });
    }
    res.set('Cache-Control', 'no-store');
    return res.json({ token: signCatalogAdminToken(req.user.id), expiresInSeconds: 14400 });
});

router.post('/inventory/:sourceId/vod/:categoryId/posters/refresh', requireAuth, requireSettingsAdmin, async (req, res) => {
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
