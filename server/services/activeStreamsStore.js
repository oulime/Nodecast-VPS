const { getDb } = require('../db/sqlite');

const STALE_TIMEOUT_MS = 45 * 1000; // 45 seconds timeout without heartbeat

// In-memory active streams cache for fast checks: key = `${userId}:${deviceType}`
// value = { userId, deviceType, deviceId, streamId, streamTitle, ipAddress, sessionKey, lastHeartbeat, startedAt }
const memoryStreams = new Map();

function initDb() {
    try {
        const db = getDb();
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_active_streams (
                user_id TEXT NOT NULL,
                device_type TEXT NOT NULL CHECK(device_type IN ('machine', 'tv')),
                device_id TEXT NOT NULL,
                stream_id TEXT,
                stream_title TEXT,
                ip_address TEXT,
                session_key TEXT NOT NULL,
                started_at TEXT DEFAULT (datetime('now')),
                last_heartbeat TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, device_type)
            );
            CREATE INDEX IF NOT EXISTS idx_active_streams_user ON user_active_streams(user_id);
        `);

        // Load existing active streams from SQLite into memory on startup
        const rows = db.prepare('SELECT * FROM user_active_streams').all();
        const now = Date.now();
        for (const row of rows) {
            const lastTime = new Date(row.last_heartbeat).getTime();
            if (now - lastTime < STALE_TIMEOUT_MS) {
                const key = `${row.user_id}:${row.device_type}`;
                memoryStreams.set(key, {
                    userId: String(row.user_id),
                    deviceType: row.device_type,
                    deviceId: row.device_id,
                    streamId: row.stream_id,
                    streamTitle: row.stream_title,
                    ipAddress: row.ip_address,
                    sessionKey: row.session_key,
                    startedAt: row.started_at,
                    lastHeartbeat: lastTime
                });
            }
        }
    } catch (e) {
        console.error('[ActiveStreamsStore] DB initialization error:', e.message);
    }
}

initDb();

// Periodic cleanup of stale streams in memory & DB every 20s
setInterval(() => {
    try {
        const now = Date.now();
        for (const [key, stream] of memoryStreams.entries()) {
            if (now - stream.lastHeartbeat > STALE_TIMEOUT_MS) {
                memoryStreams.delete(key);
            }
        }
        const db = getDb();
        db.prepare("DELETE FROM user_active_streams WHERE last_heartbeat < datetime('now', '-45 seconds')").run();
    } catch (_) {}
}, 20000).unref?.();

const activeStreamsStore = {
    /**
     * Register a new active stream for a user & deviceType ('machine' | 'tv').
     * If another stream was playing on the same slot, it is superseded.
     */
    registerStream({ userId, deviceType = 'machine', deviceId, streamId = '', streamTitle = '', ipAddress = '', sessionKey }) {
        if (!userId) return { ok: false, error: 'User ID required' };
        const normUserId = String(userId).trim();
        const normType = deviceType === 'tv' ? 'tv' : 'machine';
        const key = `${normUserId}:${normType}`;
        const now = Date.now();
        const effectiveKey = sessionKey || `sess_${Math.random().toString(36).slice(2, 10)}_${now}`;

        const previous = memoryStreams.get(key);
        let superseded = false;
        let supersededDeviceId = null;

        if (previous && (previous.deviceId !== deviceId || previous.sessionKey !== effectiveKey)) {
            superseded = true;
            supersededDeviceId = previous.deviceId;
        }

        const entry = {
            userId: normUserId,
            deviceType: normType,
            deviceId: String(deviceId || '').trim() || 'unknown',
            streamId: String(streamId || '').trim(),
            streamTitle: String(streamTitle || '').trim(),
            ipAddress: String(ipAddress || '').trim(),
            sessionKey: effectiveKey,
            startedAt: new Date().toISOString(),
            lastHeartbeat: now
        };

        memoryStreams.set(key, entry);

        try {
            const db = getDb();
            db.prepare(`
                INSERT INTO user_active_streams (
                    user_id, device_type, device_id, stream_id, stream_title, ip_address, session_key, started_at, last_heartbeat
                ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(user_id, device_type) DO UPDATE SET
                    device_id = excluded.device_id,
                    stream_id = excluded.stream_id,
                    stream_title = excluded.stream_title,
                    ip_address = excluded.ip_address,
                    session_key = excluded.session_key,
                    started_at = excluded.started_at,
                    last_heartbeat = datetime('now')
            `).run(
                entry.userId,
                entry.deviceType,
                entry.deviceId,
                entry.streamId,
                entry.streamTitle,
                entry.ipAddress,
                entry.sessionKey
            );
        } catch (err) {
            console.error('[ActiveStreamsStore] registerStream DB error:', err.message);
        }

        return {
            ok: true,
            sessionKey: effectiveKey,
            superseded,
            supersededDeviceId
        };
    },

    /**
     * Heartbeat sent periodically (every 15-20s) while media is actively playing.
     * Returns ok: true if this device is still the active player on its slot.
     * Returns superseded: true if another device on the same slot has taken over.
     */
    heartbeat({ userId, deviceType = 'machine', deviceId, sessionKey }) {
        if (!userId) return { ok: false, error: 'User ID required' };
        const normUserId = String(userId).trim();
        const normType = deviceType === 'tv' ? 'tv' : 'machine';
        const key = `${normUserId}:${normType}`;
        const now = Date.now();

        const current = memoryStreams.get(key);

        if (!current) {
            // Re-register if expired or restarted
            return this.registerStream({ userId, deviceType, deviceId, sessionKey });
        }

        // Check if another device or session has superseded this one
        if (sessionKey && current.sessionKey !== sessionKey) {
            return {
                ok: false,
                superseded: true,
                message: normType === 'tv'
                    ? 'La lecture a démarré sur un autre téléviseur.'
                    : 'La lecture a démarré sur un autre appareil (PC / Mobile).'
            };
        }

        if (deviceId && current.deviceId && current.deviceId !== 'unknown' && current.deviceId !== deviceId) {
            return {
                ok: false,
                superseded: true,
                message: normType === 'tv'
                    ? 'La lecture a démarré sur un autre téléviseur.'
                    : 'La lecture a démarré sur un autre appareil (PC / Mobile).'
            };
        }

        // Update heartbeat timestamp
        current.lastHeartbeat = now;
        try {
            const db = getDb();
            db.prepare(`
                UPDATE user_active_streams
                SET last_heartbeat = datetime('now')
                WHERE user_id = ? AND device_type = ?
            `).run(normUserId, normType);
        } catch (_) {}

        return { ok: true, active: true };
    },

    /**
     * Release stream when media pauses, ends, or page unloads.
     */
    releaseStream({ userId, deviceType = 'machine', deviceId, sessionKey }) {
        if (!userId) return { ok: false };
        const normUserId = String(userId).trim();
        const normType = deviceType === 'tv' ? 'tv' : 'machine';
        const key = `${normUserId}:${normType}`;

        const current = memoryStreams.get(key);
        if (current) {
            if (sessionKey && current.sessionKey !== sessionKey) {
                // A newer session already owns this slot, don't delete it
                return { ok: true };
            }
            if (deviceId && current.deviceId !== deviceId) {
                return { ok: true };
            }
            memoryStreams.delete(key);
        }

        try {
            const db = getDb();
            if (sessionKey) {
                db.prepare('DELETE FROM user_active_streams WHERE user_id = ? AND device_type = ? AND session_key = ?').run(normUserId, normType, sessionKey);
            } else {
                db.prepare('DELETE FROM user_active_streams WHERE user_id = ? AND device_type = ?').run(normUserId, normType);
            }
        } catch (_) {}

        return { ok: true };
    },

    /**
     * Get active streams for a user (machine + tv).
     */
    getActiveStreams(userId) {
        if (!userId) return { machine: null, tv: null };
        const normUserId = String(userId).trim();
        const now = Date.now();

        const machine = memoryStreams.get(`${normUserId}:machine`);
        const tv = memoryStreams.get(`${normUserId}:tv`);

        return {
            machine: (machine && now - machine.lastHeartbeat < STALE_TIMEOUT_MS) ? machine : null,
            tv: (tv && now - tv.lastHeartbeat < STALE_TIMEOUT_MS) ? tv : null
        };
    },

    /**
     * Extract user identity (id, role, username) from request headers, query, or TV tokens.
     */
    extractUserFromRequest(req) {
        if (!req) return null;
        try {
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'nodecast-tv-secret-key-change-in-production';

            let token = '';
            const authHeader = req.headers?.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.slice(7).trim();
            } else if (req.query?.token) {
                token = String(req.query.token).trim();
            } else if (req.body?.token) {
                token = String(req.body.token).trim();
            } else if (req.headers?.['x-velora-token']) {
                token = String(req.headers['x-velora-token']).trim();
            }

            if (token) {
                try {
                    const payload = jwt.verify(token, JWT_SECRET);
                    if (payload && payload.id) {
                        return { id: String(payload.id), username: payload.username, role: payload.role || 'viewer' };
                    }
                } catch (_) {
                    const decoded = jwt.decode(token);
                    if (decoded && decoded.id) {
                        return { id: String(decoded.id), username: decoded.username, role: decoded.role || 'viewer' };
                    }
                }
            }

            // Check if TV token cookie or query
            const rawCookie = req.headers?.cookie || '';
            const cookieMatch = rawCookie.match(/(?:^|; )velora_tv_token=([^;]*)/);
            const tvToken = req.query?.tvToken || req.body?.tvToken || (cookieMatch ? decodeURIComponent(cookieMatch[1]) : null);
            if (tvToken) {
                const db = getDb();
                const row = db.prepare('SELECT user_id FROM user_tv_devices ut JOIN tv_tokens tt ON ut.device_id = tt.device_id WHERE tt.tv_token = ?').get(tvToken);
                if (row && row.user_id) {
                    return { id: String(row.user_id), role: 'viewer', isTv: true };
                }
            }
        } catch (_) {}
        return null;
    }
};

module.exports = activeStreamsStore;

