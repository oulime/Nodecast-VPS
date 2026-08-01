const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const net = require('net');
const path = require('path');
const auth = require('../auth');
const paidUsersStore = require('../services/paidUsersStore');

const router = express.Router();
const localTrialUsage = new Map();
let whitelistWriteQueue = Promise.resolve();

const TRIAL_INCREMENT_SECONDS = 5;

function trialApiBase() {
    return (process.env.VELORA_TRIAL_API_BASE || process.env.VELORA_API_BASE || '').trim().replace(/\/+$/, '');
}

function shouldUseRemoteTrialAdmin() {
    return /^(1|true|yes)$/i.test(String(process.env.VELORA_TRIAL_REMOTE_ADMIN || '').trim());
}

function shouldUseRemoteTrialApi() {
    return /^(1|true|yes)$/i.test(String(process.env.VELORA_TRIAL_REMOTE_API || '').trim());
}

function trialLimitSeconds() {
    const seconds = Number(process.env.TRIAL_SECONDS || process.env.VITE_TRIAL_SECONDS || process.env.TRIAL_LIMIT_SECONDS || 600);
    if (!Number.isFinite(seconds) || seconds <= 0) return 600;
    return Math.min(Math.max(Math.floor(seconds), 1), 86400);
}

function normalizeIp(raw) {
    const value = String(raw || '').trim();
    return value.startsWith('::ffff:') ? value.slice(7) : value;
}

function looksLikeIp(value) {
    if (!value) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
    return value.includes(':');
}

function headerValue(req, name) {
    const value = req.get(name);
    return typeof value === 'string' ? value.trim() : '';
}

function clientIp(req) {
    const cf = normalizeIp(headerValue(req, 'cf-connecting-ip'));
    if (looksLikeIp(cf)) return cf;

    const xff = headerValue(req, 'x-forwarded-for');
    if (xff) {
        const first = normalizeIp((xff.split(',')[0] || '').trim());
        if (looksLikeIp(first)) return first;
    }

    const real = normalizeIp(headerValue(req, 'x-real-ip'));
    if (looksLikeIp(real)) return real;

    const remote = normalizeIp(req.ip || req.socket?.remoteAddress || '');
    return looksLikeIp(remote) ? remote : '0.0.0.0';
}

function whitelistFilePath() {
    return process.env.VELORA_TRIAL_WHITELIST_FILE ||
        path.join(__dirname, '..', '..', 'data', 'trial-whitelist.json');
}

function canonicalIpForWhitelist(raw) {
    const value = normalizeIp(raw);
    if (net.isIP(value) === 4) return value;
    if (net.isIP(value) === 6) return value.toLowerCase();
    return value;
}

function isValidIpAddress(raw) {
    const value = canonicalIpForWhitelist(raw);
    return net.isIP(value) !== 0;
}

async function loadLocalWhitelist() {
    try {
        const raw = await fs.readFile(whitelistFilePath(), 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.items) ? parsed.items : [];
    } catch (err) {
        if (err?.code === 'ENOENT') return [];
        throw err;
    }
}

async function saveLocalWhitelist(items) {
    const filePath = whitelistFilePath();
    whitelistWriteQueue = whitelistWriteQueue.then(async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const tmpPath = `${filePath}.tmp`;
        await fs.writeFile(tmpPath, JSON.stringify({ items }, null, 2));
        await fs.rename(tmpPath, filePath);
    });
    return whitelistWriteQueue;
}

function localEnvWhitelistIps() {
    return String(process.env.VELORA_TRIAL_WHITELIST_IPS || '')
        .split(',')
        .map((item) => canonicalIpForWhitelist(item))
        .filter((item) => isValidIpAddress(item));
}

async function isLocallyWhitelisted(req) {
    const ip = canonicalIpForWhitelist(clientIp(req));
    if (localEnvWhitelistIps().includes(ip)) return true;
    const items = await loadLocalWhitelist();
    return items.some((item) => canonicalIpForWhitelist(item.ipAddress) === ip);
}

function trialIdentityKeys(req, deviceId) {
    return [
        `ip:${clientIp(req)}`,
        `device:${deviceId}`
    ];
}

function resolveDeviceId(req) {
    return req.get('x-velora-trial-device-id') || `nodecast-${Math.random().toString(36).slice(2)}`;
}

function tokenFromRequest(req) {
    const authHeader = headerValue(req, 'authorization');
    return /^Bearer\s+(.+)$/i.exec(authHeader)?.[1]?.trim() || '';
}

function subscriptionStatus(user) {
    if (!user || user.role === 'admin') return 'admin';
    if (user.subscriptionBlocked) return 'blocked';
    if (!user.subscriptionEnd) return 'trial';
    const end = new Date(user.subscriptionEnd);
    if (Number.isNaN(end.getTime())) return 'expired';
    return end.getTime() > Date.now() ? 'active' : 'expired';
}

async function authenticatedUser(req) {
    const token = tokenFromRequest(req);
    if (!token) return null;

    // Development uses the VPS as the single authentication authority. Ask it
    // to validate the bearer token and resolve the user from VPS SQLite.
    if (process.env.NODE_ENV !== 'production') {
        const base = String(
            process.env.VPS_DATA_API_BASE || 'https://nodecast.veloravip.net'
        ).trim().replace(/\/+$/, '');
        try {
            const upstream = await fetch(`${base}/api/auth/me`, {
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`
                },
                cache: 'no-store'
            });
            if (upstream.status === 401 || upstream.status === 404) return null;
            if (!upstream.ok) throw new Error(`VPS authentication returned HTTP ${upstream.status}`);
            return upstream.json();
        } catch (err) {
            console.warn('[Auth] VPS SQLite validation unavailable:', err.message);
            return null;
        }
    }

    const payload = auth.verifyToken(token);
    if (!payload?.id) return null;
    return paidUsersStore.getById(payload.id);
}

function buildPaidPayload(req, user, deviceId = resolveDeviceId(req)) {
    const limitSeconds = trialLimitSeconds();
    const status = user.role === 'admin' ? 'admin' : 'active';
    return {
        allowed: true,
        whitelisted: true,
        paid: user.role !== 'admin',
        unlimited: true,
        deviceId,
        userId: user.id,
        username: user.username,
        displayName: user.displayName || null,
        subscriptionStart: user.subscriptionStart || null,
        subscriptionEnd: user.subscriptionEnd || null,
        subscriptionStatus: status,
        secondsUsed: 0,
        secondsRemaining: limitSeconds,
        limitSeconds,
        checkoutUrl: process.env.VELORA_CHECKOUT_URL || '/checkout'
    };
}

function buildSubscriptionDeniedPayload(req, user, deviceId = resolveDeviceId(req)) {
    const limitSeconds = trialLimitSeconds();
    const status = subscriptionStatus(user);
    return {
        allowed: false,
        whitelisted: false,
        paid: false,
        accountRequired: true,
        deviceId,
        userId: user.id,
        username: user.username,
        displayName: user.displayName || null,
        subscriptionStart: user.subscriptionStart || null,
        subscriptionEnd: user.subscriptionEnd || null,
        subscriptionStatus: status,
        secondsUsed: limitSeconds,
        secondsRemaining: 0,
        limitSeconds,
        checkoutUrl: process.env.VELORA_CHECKOUT_URL || '/checkout'
    };
}

async function subscriptionPayloadForRequest(req, deviceId = resolveDeviceId(req)) {
    const user = await authenticatedUser(req);
    if (!user) return null;
    if (user.role === 'admin' || subscriptionStatus(user) === 'active') return buildPaidPayload(req, user, deviceId);
    return buildSubscriptionDeniedPayload(req, user, deviceId);
}

function buildTrialPayload(req, secondsUsed = 0, deviceId = resolveDeviceId(req), whitelisted = false) {
    const limitSeconds = trialLimitSeconds();
    const used = whitelisted ? 0 : Math.min(Math.max(Math.floor(secondsUsed), 0), limitSeconds);
    return {
        allowed: whitelisted || used < limitSeconds,
        whitelisted,
        deviceId,
        secondsUsed: used,
        secondsRemaining: Math.max(0, limitSeconds - used),
        limitSeconds,
        checkoutUrl: process.env.VELORA_CHECKOUT_URL || '/checkout'
    };
}

async function localTrialStatus(req) {
    const deviceId = resolveDeviceId(req);
    const subscriptionPayload = await subscriptionPayloadForRequest(req, deviceId);
    if (subscriptionPayload) return subscriptionPayload;
    const whitelisted = req.get('x-velora-trial-test') !== '1' && await isLocallyWhitelisted(req);
    const used = Math.max(0, ...trialIdentityKeys(req, deviceId).map((key) => localTrialUsage.get(key) || 0));
    return buildTrialPayload(req, used, deviceId, whitelisted);
}

async function localTrialIncrement(req) {
    const current = await localTrialStatus(req);
    if (current.whitelisted) return current;

    const used = Math.min(current.secondsUsed + TRIAL_INCREMENT_SECONDS, current.limitSeconds);
    for (const key of trialIdentityKeys(req, current.deviceId)) {
        localTrialUsage.set(key, used);
    }
    return buildTrialPayload(req, used, current.deviceId, false);
}

function copyHeader(req, name, out) {
    const value = req.get(name);
    if (value && value.trim()) out[name] = value;
}

function proxyHeaders(req) {
    const headers = {
        accept: 'application/json',
        'user-agent': req.get('user-agent') || 'Nodecast Velora Trial Proxy',
        'x-forwarded-for': clientIp(req)
    };
    copyHeader(req, 'cookie', headers);
    copyHeader(req, 'authorization', headers);
    copyHeader(req, 'x-admin-access', headers);
    copyHeader(req, 'x-velora-admin-access', headers);
    copyHeader(req, 'x-velora-trial-device-id', headers);
    copyHeader(req, 'x-velora-trial-test', headers);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        headers['content-type'] = 'application/json';
    }
    return headers;
}

function getAdminAccessKey() {
    return (process.env.ADMIN_ACCESS_KEY || process.env.VELORA_ADMIN_ACCESS_KEY || process.env.VITE_ADMIN_ACCESS_KEY || '').trim();
}

function verifyAdminAccess(req) {
    const configured = getAdminAccessKey();
    if (!configured) return true;

    const auth = headerValue(req, 'authorization');
    const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() || '';
    const sent = headerValue(req, 'x-velora-admin-access') || headerValue(req, 'x-admin-access') || bearer;
    if (!sent) return false;
    try {
        const a = Buffer.from(configured, 'utf8');
        const b = Buffer.from(sent, 'utf8');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

function requireLocalAdmin(req, res) {
    if (verifyAdminAccess(req)) return true;
    res.status(401).json({ error: 'Unauthorized' });
    return false;
}

function resetLocalTrialUsageForIp(ipAddress) {
    localTrialUsage.delete(`ip:${canonicalIpForWhitelist(ipAddress)}`);
}

async function handleLocalAdminTrialWhitelist(req, res) {
    if (!requireLocalAdmin(req, res)) return;
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method === 'GET') {
        const fileItems = await loadLocalWhitelist();
        const envItems = localEnvWhitelistIps()
            .filter((ipAddress) => !fileItems.some((item) => canonicalIpForWhitelist(item.ipAddress) === ipAddress))
            .map((ipAddress) => ({
                ipAddress,
                label: 'Environment',
                notes: 'Configured with VELORA_TRIAL_WHITELIST_IPS',
                createdAt: null,
                updatedAt: null
            }));
        res.status(200).json({ items: [...fileItems, ...envItems] });
        return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const ipAddress = canonicalIpForWhitelist(body.ipAddress || '');
    if (!isValidIpAddress(ipAddress)) {
        res.status(400).json({ error: 'Adresse IP invalide.' });
        return;
    }

    const items = await loadLocalWhitelist();
    if (req.method === 'POST') {
        const now = new Date().toISOString();
        const existingIndex = items.findIndex((item) => canonicalIpForWhitelist(item.ipAddress) === ipAddress);
        const nextItem = {
            ipAddress,
            label: typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null,
            notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
            createdAt: existingIndex >= 0 ? items[existingIndex].createdAt : now,
            updatedAt: now
        };
        if (existingIndex >= 0) items[existingIndex] = nextItem;
        else items.push(nextItem);
        items.sort((a, b) => String(a.ipAddress).localeCompare(String(b.ipAddress)));
        await saveLocalWhitelist(items);
        resetLocalTrialUsageForIp(ipAddress);
        res.status(200).json({ item: nextItem });
        return;
    }

    if (req.method === 'DELETE') {
        const nextItems = items.filter((item) => canonicalIpForWhitelist(item.ipAddress) !== ipAddress);
        await saveLocalWhitelist(nextItems);
        res.status(200).json({ success: true, ipAddress });
        return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
}

async function handleLocalAdminTrialReset(req, res) {
    if (!requireLocalAdmin(req, res)) return;
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }
    const ipAddress = canonicalIpForWhitelist(clientIp(req));
    resetLocalTrialUsageForIp(ipAddress);
    res.status(200).json({
        success: true,
        ipAddress,
        resetKeys: [ipAddress],
        trialReset: true
    });
}

async function forwardVeloraApiRequest(req, res, path, options = {}) {
    if (options.localFallback) {
        const payload = await subscriptionPayloadForRequest(req);
        if (payload) {
            res.setHeader('X-Velora-Trial-Device-Id', payload.deviceId);
            res.status(200).json(payload);
            return;
        }
    }

    const base = shouldUseRemoteTrialApi() ? trialApiBase() : '';
    if (!base) {
        if (options.localFallback) {
            try {
                const payload = await options.localFallback(req);
                res.setHeader('X-Velora-Trial-Device-Id', payload.deviceId);
                res.status(200).json(payload);
            } catch (err) {
                res.status(500).json({
                    error: err?.message || 'Local Velora trial fallback failed',
                    code: 'trial_local_error'
                });
            }
            return;
        }
        res.status(503).json({
            error: 'VELORA_TRIAL_API_BASE or VELORA_API_BASE is required for this Velora admin trial route.',
            code: 'trial_config'
        });
        return;
    }

    try {
        const upstream = await fetch(`${base}${path}`, {
            method: req.method,
            headers: proxyHeaders(req),
            body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? JSON.stringify(req.body || {}) : undefined
        });
        const text = await upstream.text();
        const setCookie = upstream.headers.get('set-cookie');
        if (setCookie) res.setHeader('Set-Cookie', setCookie);
        const deviceId = upstream.headers.get('x-velora-trial-device-id');
        if (deviceId) res.setHeader('X-Velora-Trial-Device-Id', deviceId);
        res.status(upstream.status);
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
        res.send(text);
    } catch (err) {
        res.status(502).json({
            error: err?.message || 'Velora trial proxy failed',
            code: 'trial_proxy_error'
        });
    }
}

function sanitizePaidText(value, maxLength = 160) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : null;
}

function paidPlanMonths(value) {
    const months = Number.parseInt(value, 10);
    if (![1, 3, 6, 12, 24].includes(months)) {
        throw new Error('Period must be 1, 3, 6, 12, or 24 months');
    }
    return months;
}

function addPaidMonths(date, months) {
    const next = new Date(date.getTime());
    const day = next.getDate();
    next.setMonth(next.getMonth() + months);
    if (next.getDate() !== day) next.setDate(0);
    return next;
}

function paidPublicUser(user) {
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return {
        ...safe,
        displayName: safe.displayName || null,
        subscriptionStart: safe.subscriptionStart || null,
        subscriptionEnd: safe.subscriptionEnd || null,
        subscriptionPlanMonths: safe.subscriptionPlanMonths || null,
        subscriptionBlocked: Boolean(safe.subscriptionBlocked),
        subscriptionStatus: subscriptionStatus(safe)
    };
}

async function listPaidUsers(req, res) {
    if (!requireLocalAdmin(req, res)) return;
    const allUsers = await paidUsersStore.getAll();
    res.json(allUsers.filter(user => user.role !== 'admin').map(paidPublicUser));
}

async function createPaidUser(req, res) {
    if (!requireLocalAdmin(req, res)) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const username = sanitizePaidText(body.username, 80);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const months = paidPlanMonths(body.subscriptionPlanMonths || 1);
    const start = new Date();
    const end = addPaidMonths(start, months);
    const passwordHash = await auth.hashPassword(password);
    const user = await paidUsersStore.create({
        username,
        passwordHash,
        role: 'viewer',
        displayName: sanitizePaidText(body.displayName),
        subscriptionStart: start.toISOString(),
        subscriptionEnd: end.toISOString(),
        subscriptionPlanMonths: months,
        subscriptionBlocked: false
    });
    res.status(201).json(paidPublicUser(user));
}

async function updatePaidUser(req, res) {
    if (!requireLocalAdmin(req, res)) return;
    const existing = await paidUsersStore.getById(req.params.id);
    if (!existing || existing.role === 'admin') return res.status(404).json({ error: 'User not found' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(body, 'displayName')) updates.displayName = sanitizePaidText(body.displayName);
    if (Object.prototype.hasOwnProperty.call(body, 'username')) {
        const username = sanitizePaidText(body.username, 80);
        if (!username) return res.status(400).json({ error: 'Username is required' });
        updates.username = username;
    }
    if (body.password) {
        if (String(body.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
        updates.passwordHash = await auth.hashPassword(String(body.password));
    }
    if (Object.prototype.hasOwnProperty.call(body, 'subscriptionBlocked')) updates.subscriptionBlocked = Boolean(body.subscriptionBlocked);
    const user = await paidUsersStore.update(req.params.id, updates);
    res.json(paidPublicUser(user));
}

async function renewPaidUser(req, res) {
    if (!requireLocalAdmin(req, res)) return;
    const existing = await paidUsersStore.getById(req.params.id);
    if (!existing || existing.role === 'admin') return res.status(404).json({ error: 'User not found' });
    const months = paidPlanMonths(req.body?.subscriptionPlanMonths || 1);
    const now = new Date();
    const currentEnd = existing.subscriptionEnd ? new Date(existing.subscriptionEnd) : null;
    const base = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
    const end = addPaidMonths(base, months);
    const user = await paidUsersStore.update(req.params.id, {
        subscriptionStart: existing.subscriptionStart || now.toISOString(),
        subscriptionEnd: end.toISOString(),
        subscriptionPlanMonths: months,
        subscriptionBlocked: false
    });
    res.json(paidPublicUser(user));
}

async function deletePaidUser(req, res) {
    if (!requireLocalAdmin(req, res)) return;
    const existing = await paidUsersStore.getById(req.params.id);
    if (!existing || existing.role === 'admin') return res.status(404).json({ error: 'User not found' });
    await paidUsersStore.delete(req.params.id);
    res.json({ success: true });
}

async function paidUsersStorageInfo(req, res) {
    if (!requireLocalAdmin(req, res)) return;
    res.json(paidUsersStore.config());
}

router.get('/admin/paid-users/storage', (req, res) => {
    void paidUsersStorageInfo(req, res).catch(err => res.status(500).json({ error: err?.message || 'Failed to read paid user storage config' }));
});
router.get('/admin/paid-users', (req, res) => {
    void listPaidUsers(req, res).catch(err => res.status(500).json({ error: err?.message || 'Failed to list paid users' }));
});
router.post('/admin/paid-users', (req, res) => {
    void createPaidUser(req, res).catch(err => res.status(500).json({ error: err?.message || 'Failed to create paid user' }));
});
router.put('/admin/paid-users/:id', (req, res) => {
    void updatePaidUser(req, res).catch(err => res.status(500).json({ error: err?.message || 'Failed to update paid user' }));
});
router.post('/admin/paid-users/:id/renew', (req, res) => {
    void renewPaidUser(req, res).catch(err => res.status(500).json({ error: err?.message || 'Failed to renew paid user' }));
});
router.delete('/admin/paid-users/:id', (req, res) => {
    void deletePaidUser(req, res).catch(err => res.status(500).json({ error: err?.message || 'Failed to delete paid user' }));
});
router.get('/trial-status', (req, res) => {
    void forwardVeloraApiRequest(req, res, '/api/trial-status', { localFallback: localTrialStatus });
});

router.post('/trial-increment', (req, res) => {
    void forwardVeloraApiRequest(req, res, '/api/trial-increment', { localFallback: localTrialIncrement });
});

router.get('/admin/my-ip', (req, res) => {
    const base = trialApiBase();
    if (!base || !shouldUseRemoteTrialAdmin()) {
        if (!requireLocalAdmin(req, res)) return;
        res.status(200).json({ ipAddress: clientIp(req) });
        return;
    }
    void forwardVeloraApiRequest(req, res, '/api/admin/my-ip');
});

router.all('/admin/trial-whitelist', (req, res) => {
    if (!trialApiBase() || !shouldUseRemoteTrialAdmin()) {
        void handleLocalAdminTrialWhitelist(req, res).catch((err) => {
            res.status(500).json({ error: err?.message || 'Local trial whitelist failed' });
        });
        return;
    }
    void forwardVeloraApiRequest(req, res, '/api/admin/trial-whitelist');
});

router.post('/admin/trial-reset', (req, res) => {
    if (!trialApiBase() || !shouldUseRemoteTrialAdmin()) {
        void handleLocalAdminTrialReset(req, res).catch((err) => {
            res.status(500).json({ error: err?.message || 'Local trial reset failed' });
        });
        return;
    }
    void forwardVeloraApiRequest(req, res, '/api/admin/trial-reset');
});

module.exports = router;
