const express = require('express');
const router = express.Router();
const os = require('os');
const { getDb } = require('../db/sqlite');
const { generateToken } = require('../auth');
const jwt = require('jsonwebtoken');
const paidUsersStore = require('../services/paidUsersStore');

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'nodecast-tv-secret-key-change-in-production';

function parseCookie(req, name) {
    const raw = req.headers?.cookie || '';
    const match = raw.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

function generateTvToken() {
    return 'tv_tok_' + crypto.randomBytes(16).toString('hex');
}

function getLocalIp() {
    try {
        const ifaces = os.networkInterfaces();
        for (const name of Object.keys(ifaces)) {
            for (const iface of ifaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
                    return iface.address;
                }
            }
        }
    } catch (_) {}
    return '127.0.0.1';
}

function normalizeUserId(id) {
    if (id == null) return '';
    let s = String(id).trim();
    if (s.endsWith('.0')) s = s.slice(0, -2);
    return s;
}

function tvRequireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token manquant' });
    }
    const token = authHeader.slice(7).trim();
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        if (req.user && req.user.id != null) req.user.id = normalizeUserId(req.user.id);
        return next();
    } catch (err) {
        // In local development or behind VPS proxy, token may be signed by upstream VPS secret
        try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.id) {
                const now = Date.now();
                if (!decoded.exp || decoded.exp * 1000 > now) {
                    req.user = {
                        id: normalizeUserId(decoded.id),
                        username: decoded.username,
                        role: decoded.role || 'viewer'
                    };
                    return next();
                }
            }
        } catch (_) {}
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
}

// Initialize database schema for TV devices
function initTvDb() {
    try {
        const db = getDb();
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_tv_devices (
                user_id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                device_name TEXT,
                paired_at TEXT,
                last_active_at TEXT,
                ip_address TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_user_tv_device_id ON user_tv_devices(device_id);

            CREATE TABLE IF NOT EXISTS tv_tokens (
                tv_token TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_tv_tokens_device_id ON tv_tokens(device_id);
        `);

        // Clean up legacy float strings ending in .0 (e.g. '11.0' -> '11')
        try {
            db.exec(`
                UPDATE user_tv_devices 
                SET user_id = SUBSTR(user_id, 1, LENGTH(user_id) - 2) 
                WHERE user_id LIKE '%.0';
            `);
        } catch (_) {}

        const tableInfo = db.prepare("PRAGMA table_info(user_tv_devices)").all();
        const userIdCol = tableInfo.find(c => c.name === 'user_id');
        if (userIdCol && userIdCol.type === 'INTEGER') {
            db.exec(`
                CREATE TABLE user_tv_devices_v2 (
                    user_id TEXT PRIMARY KEY,
                    device_id TEXT NOT NULL,
                    device_name TEXT,
                    paired_at TEXT,
                    last_active_at TEXT,
                    ip_address TEXT
                );
                INSERT OR IGNORE INTO user_tv_devices_v2 SELECT CAST(user_id AS TEXT), device_id, device_name, paired_at, last_active_at, ip_address FROM user_tv_devices;
                DROP TABLE user_tv_devices;
                ALTER TABLE user_tv_devices_v2 RENAME TO user_tv_devices;
                CREATE INDEX IF NOT EXISTS idx_user_tv_device_id ON user_tv_devices(device_id);
            `);
        }
    } catch (e) {
        console.error('[TV Bridge] Database initialization failed:', e.message);
    }
}
initTvDb();

// In-memory real-time state
// deviceId -> { res, pingTimer, deviceName, lastPing }
const tvClients = new Map();
// pin -> { deviceId, expiresAt }
const pinRegistry = new Map();
// deviceId -> pin
const devicePins = new Map();
// deviceId -> currentMedia
const activePlayback = new Map();

// Periodic cleanup of expired PINs (every 60s)
setInterval(() => {
    const now = Date.now();
    for (const [pin, entry] of pinRegistry.entries()) {
        if (entry.expiresAt <= now) {
            pinRegistry.delete(pin);
            devicePins.delete(entry.deviceId);
        }
    }
}, 60000).unref?.();

function generateUniquePin() {
    for (let attempts = 0; attempts < 100; attempts++) {
        const pin = String(Math.floor(1000 + Math.random() * 9000));
        if (!pinRegistry.has(pin)) return pin;
    }
    return String(Math.floor(1000 + Math.random() * 9000));
}

function sendTvEvent(deviceId, eventData) {
    const client = tvClients.get(deviceId);
    if (!client || !client.res || client.res.writableEnded) return false;
    try {
        client.res.write(`data: ${JSON.stringify(eventData)}\n\n`);
        return true;
    } catch (err) {
        console.warn(`[TV Bridge] Failed to send event to ${deviceId}:`, err.message);
        return false;
    }
}

// -------------------------------------------------------------
// TV Receiver Endpoints (Called by TV browser on /tv)
// -------------------------------------------------------------

/**
 * GET /api/tv/session
 * Called on /tv initial load. Validates or generates a deviceId and 4-digit PIN.
 */
router.get('/session', async (req, res) => {
    try {
        const db = getDb();
        let tvToken = String(req.query.tvToken || req.query.key || parseCookie(req, 'velora_tv_token') || '').trim();
        let deviceId = String(req.query.deviceId || '').trim();
        const deviceName = String(req.query.deviceName || 'Smart TV').trim();

        // 1. If a valid tvToken was provided, resolve deviceId from DB
        if (tvToken) {
            const tokenRow = db.prepare('SELECT device_id FROM tv_tokens WHERE tv_token = ?').get(tvToken);
            if (tokenRow && tokenRow.device_id) {
                deviceId = tokenRow.device_id;
            }
        }

        // 2. If deviceId is known, find or generate tvToken for it
        if (deviceId && deviceId.length >= 8) {
            if (!tvToken) {
                const tokenRow = db.prepare('SELECT tv_token FROM tv_tokens WHERE device_id = ? LIMIT 1').get(deviceId);
                if (tokenRow) {
                    tvToken = tokenRow.tv_token;
                }
            }
        } else {
            deviceId = 'tv_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        }

        // Ensure permanent tvToken exists in tv_tokens
        if (!tvToken) {
            tvToken = generateTvToken();
        }
        db.prepare('INSERT OR IGNORE INTO tv_tokens (tv_token, device_id) VALUES (?, ?)').run(tvToken, deviceId);

        // Always set 10-year persistent cookie for the TV browser
        res.setHeader('Set-Cookie', `velora_tv_token=${encodeURIComponent(tvToken)}; Path=/; Max-Age=315360000; SameSite=Lax`);

        const pairedRow = db.prepare('SELECT * FROM user_tv_devices WHERE device_id = ?').get(deviceId);

        // Always ensure a valid active 4-digit PIN exists for this device (for initial pairing or adding another account)
        let pin = devicePins.get(deviceId);
        let pinEntry = pin ? pinRegistry.get(pin) : null;

        if (!pinEntry || pinEntry.expiresAt <= Date.now()) {
            if (pin) pinRegistry.delete(pin);
            pin = generateUniquePin();
            const expiresAt = Date.now() + 300000; // 5 minutes
            pinRegistry.set(pin, { deviceId, expiresAt });
            devicePins.set(deviceId, pin);
        }

        if (pairedRow) {
            let user = await paidUsersStore.getById(pairedRow.user_id);
            if (!user) {
                // In local development or multi-DB setups, user was authenticated via upstream VPS
                user = { id: pairedRow.user_id, username: 'admin', displayName: 'admin' };
            }
            if (user && !user.subscriptionBlocked) {
                // Update last active
                db.prepare("UPDATE user_tv_devices SET last_active_at = datetime('now') WHERE device_id = ?").run(deviceId);
                const userAuthToken = generateToken(user);
                return res.json({
                    ok: true,
                    deviceId,
                    tvToken,
                    isLinked: true,
                    pin, // Always provide PIN so family members on another phone can pair to this same TV!
                    expiresIn: Math.max(0, Math.round((pinRegistry.get(pin).expiresAt - Date.now()) / 1000)),
                    deviceName: pairedRow.device_name || deviceName,
                    user: {
                        username: user.username,
                        displayName: user.displayName || user.username
                    },
                    token: userAuthToken
                });
            } else {
                // User expired or deleted, unlink TV
                db.prepare('DELETE FROM user_tv_devices WHERE device_id = ?').run(deviceId);
            }
        }

        return res.json({
            ok: true,
            deviceId,
            tvToken,
            isLinked: false,
            pin,
            expiresIn: Math.max(0, Math.round((pinRegistry.get(pin).expiresAt - Date.now()) / 1000)),
            deviceName
        });
    } catch (error) {
        console.error('[TV Bridge] session error:', error);
        res.status(500).json({ ok: false, error: 'Erreur session TV' });
    }
});

/**
 * GET /api/tv/events
 * SSE stream for real-time TV control.
 */
router.get('/events', (req, res) => {
    const deviceId = String(req.query.deviceId || '').trim();
    if (!deviceId) return res.status(400).json({ error: 'deviceId requis' });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', deviceId })}\n\n`);

    // Setup keep-alive ping every 10s to keep reverse proxies / Nginx tunnels active
    const pingTimer = setInterval(() => {
        if (!res.writableEnded) {
            res.write(': ping\n\n');
        }
    }, 10000);
    pingTimer.unref?.();

    // Register TV client
    tvClients.set(deviceId, { res, pingTimer, lastPing: Date.now() });

    req.on('close', () => {
        clearInterval(pingTimer);
        const current = tvClients.get(deviceId);
        if (current && current.res === res) {
            tvClients.delete(deviceId);
            activePlayback.delete(deviceId);
        }
    });
});

/**
 * POST /api/tv/state
 * TV updates its current playback state (e.g. playing, paused, position).
 */
router.post('/state', express.json(), (req, res) => {
    const { deviceId, state, position, duration, error, mediaId, mediaTitle, mediaType } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: 'deviceId requis' });

    if (state === 'stopped' || state === 'idle' || state === 'ended') {
        activePlayback.delete(deviceId);
    } else {
        const current = activePlayback.get(deviceId) || {};
        activePlayback.set(deviceId, {
            ...current,
            state: state || current.state || 'playing',
            position: position !== undefined ? Number(position) : current.position,
            duration: duration !== undefined ? Number(duration) : current.duration,
            id: mediaId || current.id || current.streamId || null,
            title: mediaTitle || current.title || 'Vidéo',
            type: mediaType || current.type || 'vod',
            error: error || null,
            updatedAt: Date.now()
        });
    }

    res.json({ ok: true });
});

// -------------------------------------------------------------
// Mobile / User Authenticated Endpoints
// -------------------------------------------------------------

/**
 * GET /api/tv/status
 * Checks if the authenticated user has a paired TV and if it is online.
 */
router.get('/status', tvRequireAuth, async (req, res) => {
    try {
        const db = getDb();
        const userId = normalizeUserId(req.user.id);
        const pairedRow = db.prepare('SELECT * FROM user_tv_devices WHERE user_id = ?').get(userId);

        if (!pairedRow) {
            return res.json({ ok: true, hasPairedTv: false });
        }

        const isOnline = tvClients.has(pairedRow.device_id);
        const playback = activePlayback.get(pairedRow.device_id) || null;

        res.json({
            ok: true,
            hasPairedTv: true,
            deviceId: pairedRow.device_id,
            deviceName: pairedRow.device_name || 'Smart TV',
            pairedAt: pairedRow.paired_at,
            lastActive: pairedRow.last_active_at,
            isOnline,
            currentMedia: playback
        });
    } catch (error) {
        console.error('[TV Bridge] status error:', error);
        res.status(500).json({ ok: false, error: 'Erreur statut TV' });
    }
});

/**
 * POST /api/tv/pair
 * Authenticated user submits the 4-digit PIN to link their account to the TV.
 */
router.post('/pair', tvRequireAuth, express.json(), async (req, res) => {
    try {
        const pin = String(req.body?.pin || '').trim();
        const customName = String(req.body?.deviceName || '').trim();

        if (!pin || pin.length !== 4) {
            return res.status(400).json({ ok: false, error: 'Code PIN à 4 chiffres requis' });
        }

        const pinEntry = pinRegistry.get(pin);
        if (!pinEntry || pinEntry.expiresAt <= Date.now()) {
            return res.status(400).json({ ok: false, error: 'Code PIN invalide ou expiré' });
        }

        const deviceId = pinEntry.deviceId;
        const userId = normalizeUserId(req.user.id);
        const user = (await paidUsersStore.getById(userId)) || req.user;
        if (!user) return res.status(404).json({ ok: false, error: 'Utilisateur introuvable' });

        const deviceName = customName || 'Smart TV Salon';
        const db = getDb();

        // Enforce 1-TV limit per user (upsert / replace)
        const stmt = db.prepare(`
            INSERT INTO user_tv_devices (user_id, device_id, device_name, paired_at, last_active_at, ip_address)
            VALUES (?, ?, ?, datetime('now'), datetime('now'), ?)
            ON CONFLICT(user_id) DO UPDATE SET
                device_id = excluded.device_id,
                device_name = excluded.device_name,
                paired_at = excluded.paired_at,
                last_active_at = excluded.last_active_at,
                ip_address = excluded.ip_address
        `);
        stmt.run(userId, deviceId, deviceName, req.ip || '');

        // Invalidate PIN
        pinRegistry.delete(pin);
        devicePins.delete(deviceId);

        // Ensure permanent tvToken exists in tv_tokens for this device
        let tokenRow = db.prepare('SELECT tv_token FROM tv_tokens WHERE device_id = ? LIMIT 1').get(deviceId);
        let permanentTvToken = tokenRow ? tokenRow.tv_token : generateTvToken();
        if (!tokenRow) {
            db.prepare('INSERT OR IGNORE INTO tv_tokens (tv_token, device_id) VALUES (?, ?)').run(permanentTvToken, deviceId);
        }

        // Notify TV via SSE
        const tvToken = generateToken(user);
        sendTvEvent(deviceId, {
            type: 'PAIRED',
            userId: userId,
            username: user.username,
            displayName: user.displayName || user.username,
            deviceName,
            tvToken: permanentTvToken,
            token: tvToken
        });

        res.json({
            ok: true,
            deviceId,
            deviceName,
            tvToken: permanentTvToken,
            message: 'TV associée avec succès'
        });
    } catch (error) {
        console.error('[TV Bridge] pair error:', error);
        res.status(500).json({ ok: false, error: 'Erreur jumelage TV' });
    }
});

/**
 * GET /api/tv/ping
 * Fast, lightweight presence check for mobile.
 */
router.get('/ping', tvRequireAuth, (req, res) => {
    try {
        const db = getDb();
        const userId = normalizeUserId(req.user.id);
        const pairedRow = db.prepare('SELECT device_id, device_name FROM user_tv_devices WHERE user_id = ?').get(userId);

        if (!pairedRow) {
            return res.json({ ok: true, hasPairedTv: false, isOnline: false });
        }

        const isOnline = tvClients.has(pairedRow.device_id);
        res.json({
            ok: true,
            hasPairedTv: true,
            deviceId: pairedRow.device_id,
            deviceName: pairedRow.device_name || 'Smart TV',
            isOnline
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: 'Erreur ping TV' });
    }
});

/**
 * POST /api/tv/unlink
 * Unlinks the paired TV from the user's account.
 */
router.post('/unlink', tvRequireAuth, (req, res) => {
    try {
        const db = getDb();
        const userId = normalizeUserId(req.user.id);
        const pairedRow = db.prepare('SELECT device_id FROM user_tv_devices WHERE user_id = ?').get(userId);

        if (pairedRow) {
            db.prepare('DELETE FROM user_tv_devices WHERE user_id = ?').run(userId);
            // Check if any other user is still paired to this device
            const remaining = db.prepare('SELECT user_id FROM user_tv_devices WHERE device_id = ? LIMIT 1').get(pairedRow.device_id);
            if (!remaining) {
                // If no other user is linked to this TV, tell TV to show standby PIN screen
                sendTvEvent(pairedRow.device_id, { type: 'UNLINK' });
                activePlayback.delete(pairedRow.device_id);
            }
        }

        res.json({ ok: true, message: 'TV dissociée avec succès' });
    } catch (error) {
        console.error('[TV Bridge] unlink error:', error);
        res.status(500).json({ ok: false, error: 'Erreur dissociation TV' });
    }
});

/**
 * POST /api/tv/play
 * Sends a stream to play on the user's paired TV.
 */
router.post('/play', tvRequireAuth, express.json(), async (req, res) => {
    try {
        const db = getDb();
        const userId = normalizeUserId(req.user.id);
        const pairedRow = db.prepare('SELECT device_id FROM user_tv_devices WHERE user_id = ?').get(userId);

        if (!pairedRow) {
            return res.status(400).json({ ok: false, error: 'Aucune TV associée à votre compte. Associez votre TV dans Mon Profil.' });
        }

        const deviceId = pairedRow.device_id;
        const media = req.body || {};

        let playUrl = String(media.url || '').trim();
        const port = process.env.PORT || 3000;
        const localNetworkHost = `${getLocalIp()}:${port}`;

        let targetHost = req.headers.host || localNetworkHost;
        if (targetHost.includes('localhost') || targetHost.includes('127.0.0.1')) {
            targetHost = localNetworkHost;
        }

        if (playUrl.startsWith('/')) {
            playUrl = `${req.protocol || 'http'}://${targetHost}${playUrl}`;
        }

        // Always ensure localhost / 127.0.0.1 is rewritten to targetHost reachable by the TV
        if (playUrl.includes('localhost') || playUrl.includes('127.0.0.1')) {
            playUrl = playUrl.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, `${req.protocol || 'http'}://${targetHost}`);
            playUrl = playUrl.replace(/localhost(:\d+)?|127\.0\.0\.1(:\d+)?/g, targetHost);
        }

        const user = (await paidUsersStore.getById(userId)) || req.user;
        const userToken = generateToken(user);
        if (playUrl.includes('/api/') || playUrl.includes('/proxy')) {
            if (!playUrl.includes('token=')) {
                playUrl += (playUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(userToken);
            }
        }

        console.log(`[TV Bridge] Dispatched PLAY for "${media.title || 'media'}" to device ${deviceId}:`, playUrl);

        const startPos = Number(media.position ?? media.currentTime) || 0;

        // Store active playback
        activePlayback.set(deviceId, {
            ...media,
            url: playUrl,
            state: 'playing',
            position: startPos,
            startedAt: Date.now(),
            updatedAt: Date.now()
        });

        // Push PLAY command to TV along with user token so proxy segments authenticate
        const dispatched = sendTvEvent(deviceId, {
            type: 'PLAY',
            token: userToken,
            media: {
                id: media.id || media.streamId || media.stream_id || null,
                url: playUrl,
                title: media.title || 'Vidéo',
                poster: media.poster || '',
                isLive: Boolean(media.isLive),
                type: media.type || 'vod',
                position: startPos,
                episodeTitle: media.episodeTitle || null,
                seasonNumber: media.seasonNumber || null,
                episodeNumber: media.episodeNumber || null,
                nextEpisode: media.nextEpisode || null
            }
        });

        if (!dispatched) {
            return res.status(503).json({
                ok: false,
                error: 'La TV semble en veille ou déconnectée. Ouvrez la page sur votre TV.'
            });
        }

        res.json({ ok: true, message: 'Lecture lancée sur la TV' });
    } catch (error) {
        console.error('[TV Bridge] play error:', error);
        res.status(500).json({ ok: false, error: 'Erreur lancement TV' });
    }
});

/**
 * POST /api/tv/command
 * Sends playback commands (play, pause, seek, stop, next) to TV.
 */
router.post('/command', tvRequireAuth, express.json(), (req, res) => {
    try {
        const db = getDb();
        const pairedRow = db.prepare('SELECT device_id FROM user_tv_devices WHERE user_id = ?').get(req.user.id);

        if (!pairedRow) {
            return res.status(400).json({ ok: false, error: 'Aucune TV associée' });
        }

        const { action, value } = req.body || {};
        if (!action) return res.status(400).json({ ok: false, error: 'Action requise' });

        if (action === 'stop') {
            activePlayback.delete(pairedRow.device_id);
        }

        sendTvEvent(pairedRow.device_id, {
            type: 'COMMAND',
            action,
            value
        });

        res.json({ ok: true });
    } catch (error) {
        console.error('[TV Bridge] command error:', error);
        res.status(500).json({ ok: false, error: 'Erreur commande TV' });
    }
});

module.exports = router;
