const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * Stream Security Engine
 * Provides sub-millisecond AES-256-GCM ticket generation and verification.
 * Hides upstream IPTV provider URLs, usernames, and passwords from clients.
 */

// Derive or load persistent stream encryption key (32 bytes)
const dataDir = path.join(__dirname, '..', '..', 'data');
const KEY_FILE_PATH = path.join(dataDir, '.stream_key');

function getOrCreateStreamSecretKey() {
    // 1. Try env variable first
    if (process.env.STREAM_SECRET_KEY && process.env.STREAM_SECRET_KEY.length >= 32) {
        return crypto.createHash('sha256').update(process.env.STREAM_SECRET_KEY).digest();
    }
    // 2. Try persistent file in data directory
    try {
        if (fs.existsSync(KEY_FILE_PATH)) {
            const fileKey = fs.readFileSync(KEY_FILE_PATH, 'utf8').trim();
            if (fileKey.length >= 32) {
                return crypto.createHash('sha256').update(fileKey).digest();
            }
        }
    } catch (_) {}

    // 3. Fallback to deriving from JWT_SECRET or generate persistent key
    const baseSecret = process.env.JWT_SECRET || 'velora-stream-secret-protect-providers';
    const newKey = crypto.randomBytes(32).toString('hex');
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(KEY_FILE_PATH, newKey, { encoding: 'utf8', mode: 0o600 });
    } catch (_) {}

    return crypto.createHash('sha256').update(baseSecret + ':' + newKey).digest();
}

const STREAM_CIPHER_KEY = getOrCreateStreamSecretKey();

/**
 * Encrypt arbitrary payload into a compact, URL-safe base64url ticket
 * Uses AES-256-GCM for authenticated encryption (tamper-proof)
 * Format: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
 */
function encryptTicket(payload) {
    try {
        const json = JSON.stringify(payload);
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', STREAM_CIPHER_KEY, iv);
        
        const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();

        const combined = Buffer.concat([iv, tag, encrypted]);
        return combined.toString('base64url');
    } catch (err) {
        console.error('[StreamSecurity] Encryption failed:', err);
        return null;
    }
}

/**
 * Decrypt and authenticate a base64url ticket
 * Returns payload object or null if invalid / tampered
 */
function decryptTicket(ticketStr) {
    if (!ticketStr || typeof ticketStr !== 'string') return null;
    try {
        const combined = Buffer.from(ticketStr, 'base64url');
        if (combined.length < 28) return null; // 12 bytes IV + 16 bytes Tag

        const iv = combined.subarray(0, 12);
        const tag = combined.subarray(12, 28);
        const encrypted = combined.subarray(28);

        const decipher = crypto.createDecipheriv('aes-256-gcm', STREAM_CIPHER_KEY, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
    } catch (err) {
        // Tampered or wrong key
        return null;
    }
}

/**
 * Generate an encrypted stream ticket for a resolved upstream target
 * @param {Object} params
 * @param {string} params.url - Direct upstream URL
 * @param {string|number} [params.sourceId] - Source ID
 * @param {string|number} [params.streamId] - Stream ID
 * @param {string} [params.type] - live, movie, or series
 * @param {string|number} [params.userId] - Optional authenticated user ID
 * @param {number} [params.ttlMs] - Ticket validity in milliseconds (default 24h)
 */
function createStreamTicket({ url, sourceId, streamId, type, userId, ttlMs = 24 * 60 * 60 * 1000 }) {
    const payload = {
        u: url,
        s: sourceId != null ? String(sourceId) : undefined,
        i: streamId != null ? String(streamId) : undefined,
        t: type || 'live',
        uid: userId != null ? String(userId) : undefined,
        exp: Date.now() + ttlMs
    };
    return encryptTicket(payload);
}

/**
 * Verify access permissions from ticket payload against SQLite users
 * Ensures user account is active, not blocked, and unexpired.
 */
async function verifyStreamAccess(ticketPayload) {
    if (!ticketPayload) return { allowed: false, reason: 'Invalid or missing ticket' };
    
    // Check expiry
    if (ticketPayload.exp && Date.now() > ticketPayload.exp) {
        return { allowed: false, reason: 'Stream ticket expired' };
    }

    // If no userId bound in ticket, allow playback
    if (!ticketPayload.uid) {
        return { allowed: true };
    }

    // Verify user in database
    try {
        const paidUsersStore = require('./paidUsersStore');
        const user = await paidUsersStore.getById(ticketPayload.uid);
        if (!user) {
            return { allowed: false, reason: 'User not found' };
        }
        if (user.role === 'admin') {
            return { allowed: true, user };
        }
        if (user.subscriptionBlocked) {
            return { allowed: false, reason: 'Subscription blocked' };
        }
        if (user.subscriptionEnd) {
            const end = new Date(user.subscriptionEnd).getTime();
            if (Number.isFinite(end) && end <= Date.now()) {
                return { allowed: false, reason: 'Subscription expired' };
            }
        }
        return { allowed: true, user };
    } catch (err) {
        console.warn('[StreamSecurity] User verification error:', err.message);
        return { allowed: true };
    }
}

/**
 * Rewrites an M3U8 manifest so that all child chunks and encryption key URIs
 * are signed with short-lived tickets, completely stripping provider credentials and domains.
 */
function rewriteM3u8WithTickets(manifest, playlistUrl, { baseUrlPrefix = '/api/proxy/stream', userId, ttlMs = 4 * 60 * 60 * 1000 } = {}) {
    if (!manifest || typeof manifest !== 'string') return manifest;
    let baseUrl;
    try {
        const u = new URL(playlistUrl);
        baseUrl = u.origin + u.pathname.substring(0, u.pathname.lastIndexOf('/') + 1);
    } catch (_) {
        baseUrl = playlistUrl;
    }

    return manifest.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) {
            if (trimmed.includes('URI=')) {
                return line.replace(/URI=["']([^"']+)["']/g, (match, p1) => {
                    try {
                        const absoluteUrl = new URL(p1, baseUrl).href;
                        const segTicket = createStreamTicket({
                            url: absoluteUrl,
                            userId,
                            ttlMs
                        });
                        return `URI="${baseUrlPrefix}?t=${segTicket}&format=key"`;
                    } catch (_) {
                        return match;
                    }
                });
            }
            return line;
        }

        try {
            let absoluteUrl;
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                absoluteUrl = trimmed;
            } else {
                absoluteUrl = new URL(trimmed, baseUrl).href;
            }
            const segTicket = createStreamTicket({
                url: absoluteUrl,
                userId,
                ttlMs
            });
            return `${baseUrlPrefix}?t=${segTicket}&format=chunk.ts`;
        } catch (_) {
            return line;
        }
    }).join('\n');
}

module.exports = {
    encryptTicket,
    decryptTicket,
    createStreamTicket,
    verifyStreamAccess,
    rewriteM3u8WithTickets
};
