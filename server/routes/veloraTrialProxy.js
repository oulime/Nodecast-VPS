const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const net = require('net');
const path = require('path');

const router = express.Router();
const localTrialUsage = new Map();
let whitelistWriteQueue = Promise.resolve();

const TRIAL_INCREMENT_SECONDS = 5;

function trialApiBase() {
    return (process.env.VELORA_TRIAL_API_BASE || process.env.VELORA_API_BASE || '').trim().replace(/\/+$/, '');
}

function trialLimitSeconds() {
    const seconds = Number(process.env.TRIAL_SECONDS || process.env.VITE_TRIAL_SECONDS || process.env.TRIAL_LIMIT_SECONDS || 60);
    if (!Number.isFinite(seconds) || seconds <= 0) return 60;
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

function userAgentHash(req) {
    const ua = req.get('user-agent') || '';
    return crypto.createHash('sha256').update(ua).digest('hex');
}

function trialIdentityKeys(req, deviceId) {
    return [
        `ip:${clientIp(req)}`,
        `device:${deviceId}`,
        `ua:${userAgentHash(req)}`
    ];
}

function resolveDeviceId(req) {
    return req.get('x-velora-trial-device-id') || `nodecast-${Math.random().toString(36).slice(2)}`;
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
    const base = trialApiBase();
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

router.get('/trial-status', (req, res) => {
    void forwardVeloraApiRequest(req, res, '/api/trial-status', { localFallback: localTrialStatus });
});

router.post('/trial-increment', (req, res) => {
    void forwardVeloraApiRequest(req, res, '/api/trial-increment', { localFallback: localTrialIncrement });
});

router.get('/admin/my-ip', (req, res) => {
    const base = trialApiBase();
    if (!base) {
        if (!requireLocalAdmin(req, res)) return;
        res.status(200).json({ ipAddress: clientIp(req) });
        return;
    }
    void forwardVeloraApiRequest(req, res, '/api/admin/my-ip');
});

router.all('/admin/trial-whitelist', (req, res) => {
    if (!trialApiBase()) {
        void handleLocalAdminTrialWhitelist(req, res).catch((err) => {
            res.status(500).json({ error: err?.message || 'Local trial whitelist failed' });
        });
        return;
    }
    void forwardVeloraApiRequest(req, res, '/api/admin/trial-whitelist');
});

router.post('/admin/trial-reset', (req, res) => {
    if (!trialApiBase()) {
        void handleLocalAdminTrialReset(req, res).catch((err) => {
            res.status(500).json({ error: err?.message || 'Local trial reset failed' });
        });
        return;
    }
    void forwardVeloraApiRequest(req, res, '/api/admin/trial-reset');
});

module.exports = router;
