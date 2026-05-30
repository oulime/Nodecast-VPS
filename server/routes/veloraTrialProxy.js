const express = require('express');

const router = express.Router();

function trialApiBase() {
    return (process.env.VELORA_TRIAL_API_BASE || process.env.VELORA_API_BASE || '').trim().replace(/\/+$/, '');
}

function localTrialPayload(req) {
    const seconds = Number(process.env.TRIAL_SECONDS || 60);
    const deviceId = req.get('x-velora-trial-device-id') || `nodecast-${Math.random().toString(36).slice(2)}`;
    return {
        allowed: true,
        whitelisted: true,
        deviceId,
        secondsUsed: 0,
        secondsRemaining: Number.isFinite(seconds) ? seconds : 60,
        limitSeconds: Number.isFinite(seconds) ? seconds : 60,
        checkoutUrl: process.env.VELORA_CHECKOUT_URL || '/checkout'
    };
}

function copyHeader(req, name, out) {
    const value = req.get(name);
    if (value && value.trim()) out[name] = value;
}

function clientIp(req) {
    const cf = req.get('cf-connecting-ip');
    if (cf && cf.trim()) return cf.trim();
    const xff = req.get('x-forwarded-for');
    if (xff && xff.trim()) return xff.trim();
    const real = req.get('x-real-ip');
    if (real && real.trim()) return real.trim();
    return req.ip || req.socket?.remoteAddress || '';
}

async function forwardTrialRequest(req, res, path) {
    const base = trialApiBase();
    if (!base) {
        const payload = localTrialPayload(req);
        res.setHeader('X-Velora-Trial-Device-Id', payload.deviceId);
        res.status(200).json(payload);
        return;
    }

    const headers = {
        accept: 'application/json',
        'user-agent': req.get('user-agent') || 'Nodecast Velora Trial Proxy',
        'x-forwarded-for': clientIp(req)
    };
    copyHeader(req, 'cookie', headers);
    copyHeader(req, 'x-velora-trial-device-id', headers);
    copyHeader(req, 'x-velora-trial-test', headers);

    try {
        const upstream = await fetch(`${base}${path}`, {
            method: req.method,
            headers,
            body: req.method === 'POST' ? JSON.stringify(req.body || {}) : undefined
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
    void forwardTrialRequest(req, res, '/api/trial-status');
});

router.post('/trial-increment', (req, res) => {
    void forwardTrialRequest(req, res, '/api/trial-increment');
});

module.exports = router;
