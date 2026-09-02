/**
 * channelLogoMatcher.js
 * Automated Live TV Channel Logo Matcher & Sync Engine using iptv-org open dataset.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { getDb } = require('../db/sqlite');

const CACHE_FILE = path.join(__dirname, '..', '..', 'data', 'channel-logos-cache.json');
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let inMemoryIndex = null;
let isSyncing = false;
let syncProgress = {
    running: false,
    total: 0,
    processed: 0,
    updated: 0,
    skipped: 0,
    startTime: null,
    endTime: null,
    error: null
};

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Nodecast-Channel-Logo-Sync/1.0' } }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function cleanChannelName(raw) {
    if (!raw) return '';
    let name = String(raw).trim();

    // Remove emoji/hashtag borders like "##### 4K UHD #####"
    name = name.replace(/^[#*=\-_~+\s]+|[#*=\-_~+\s]+$/g, '');

    // Normalize unicode characters (e.g. superscript ᵁᴴᴰ ³⁸⁴⁰ᴾ, accents)
    name = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

    // Strip common IPTV provider prefixes (e.g. "4K: ", "FR| ", "AR - ", "UK:", "[VIP]", "|FR|")
    name = name.replace(/^(\[.*?\]|\(.*?\)|\|.*?\|)\s*/i, '');
    name = name.replace(/^(4k|fhd|uhd|hd|sd|hevc|h265|vip|raw|premium|live|vod|series|event)[\s:|\-_]+/i, '');
    name = name.replace(/^(fr|ar|uk|us|es|it|de|pt|nl|be|ch|pl|tr|ca|ru|in|ma|dz|tn|sa|ae|eg|qa|kw)[\s:|\-_]+/i, '');
    name = name.replace(/^(4k|fhd|uhd|hd|sd|hevc|h265|vip)[\s:|\-_]+/i, '');

    // Strip common trailing resolution/event badges
    name = name.replace(/[\s:|\-_]+(4k|fhd|uhd|hd|sd|hevc|h265|event|live|backup|vip|\(\d+\)|\[.*?\]|\(.*?\)).*$/i, '');
    name = name.replace(/[\s:|\-_]+(1080p|720p|50fps|60fps|h264|aac|raw).*$/i, '');

    // Collapse spaces and trim
    return name.replace(/\s+/g, ' ').trim();
}

function normalizeKey(str) {
    if (!str) return '';
    return str
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\+/g, 'plus')
        .replace(/&/g, 'and')
        .replace(/[\s'’.\-_/\\()]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

async function loadOrBuildLogoIndex(forceRefresh = false) {
    if (inMemoryIndex && !forceRefresh) {
        return inMemoryIndex;
    }

    let cacheData = null;
    if (!forceRefresh && fs.existsSync(CACHE_FILE)) {
        try {
            const stats = fs.statSync(CACHE_FILE);
            if (Date.now() - stats.mtimeMs < CACHE_MAX_AGE_MS) {
                cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            }
        } catch (_) {}
    }

    if (!cacheData || !cacheData.channels || !cacheData.logos) {
        console.log('[ChannelLogoMatcher] Downloading fresh TV channels and logos from iptv-org...');
        try {
            const [channels, logos] = await Promise.all([
                fetchJson('https://iptv-org.github.io/api/channels.json'),
                fetchJson('https://iptv-org.github.io/api/logos.json')
            ]);
            cacheData = { channels, logos, timestamp: Date.now() };
            fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
            fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData));
        } catch (e) {
            console.warn('[ChannelLogoMatcher] Failed to download iptv-org dataset, checking existing cache:', e.message);
            if (fs.existsSync(CACHE_FILE)) {
                cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            } else {
                throw e;
            }
        }
    }

    const logoById = new Map();
    for (const l of cacheData.logos || []) {
        if (l.channel && l.url && !logoById.has(l.channel)) {
            // Prefer PNG or SVG
            logoById.set(l.channel, l.url);
        }
    }

    const exactMap = new Map();
    const cleanMap = new Map();

    for (const c of cacheData.channels || []) {
        const logo = logoById.get(c.id);
        if (!logo) continue;

        const names = [c.name, ...(c.alt_names || [])];
        for (const n of names) {
            if (!n) continue;
            const norm = normalizeKey(n);
            if (norm && !exactMap.has(norm)) {
                exactMap.set(norm, { id: c.id, name: c.name, logo, country: c.country });
            }
            const clean = normalizeKey(cleanChannelName(n));
            if (clean && !cleanMap.has(clean)) {
                cleanMap.set(clean, { id: c.id, name: c.name, logo, country: c.country });
            }
        }
    }

    inMemoryIndex = { exactMap, cleanMap, totalIndexed: exactMap.size };
    console.log(`[ChannelLogoMatcher] Indexed ${inMemoryIndex.totalIndexed} TV channel logo mappings.`);
    return inMemoryIndex;
}

function matchChannelLogo(rawName, countryHint = '') {
    if (!inMemoryIndex) return null;
    const { exactMap, cleanMap } = inMemoryIndex;

    const candidates = [];
    candidates.push(normalizeKey(rawName));

    const cleaned = cleanChannelName(rawName);
    const cleanNorm = normalizeKey(cleaned);
    candidates.push(cleanNorm);

    // Remove secondary qualifiers like "premium", "cinema", "cinemas", "box office", "extra"
    const strippedQualifiers = cleaned
        .replace(/\b(premium|extra|live|event|feed|box\s*office)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (strippedQualifiers && strippedQualifiers !== cleaned) {
        candidates.push(normalizeKey(strippedQualifiers));
    }

    // Number repositioning: e.g. "beIN Sports 1 Premium" -> "beIN Sports Premium 1"
    const numMatch = cleaned.match(/\b(\d+)\s+([a-z]+)\b/i);
    if (numMatch) {
        candidates.push(normalizeKey(cleaned.replace(numMatch[0], `${numMatch[2]} ${numMatch[1]}`)));
    }

    // Plural/singular normalization (e.g. cinema <-> cinemas, sports <-> sport)
    const singular = cleanNorm
        .replace(/cinemas/g, 'cinema')
        .replace(/sports/g, 'sport');
    if (singular !== cleanNorm) {
        candidates.push(singular);
    }
    const plural = cleanNorm
        .replace(/cinema(?![a-z])/g, 'cinemas')
        .replace(/sport(?![a-z])/g, 'sports');
    if (plural !== cleanNorm) {
        candidates.push(plural);
    }

    for (const key of candidates) {
        if (!key) continue;
        if (exactMap.has(key)) return exactMap.get(key);
        if (cleanMap.has(key)) return cleanMap.get(key);
    }

    return null;
}

async function syncAllChannelLogos(options = {}) {
    if (isSyncing) {
        return { error: 'Sync already in progress', progress: syncProgress };
    }

    isSyncing = true;
    syncProgress = {
        running: true,
        total: 0,
        processed: 0,
        updated: 0,
        skipped: 0,
        startTime: Date.now(),
        endTime: null,
        error: null
    };

    try {
        await loadOrBuildLogoIndex(options.forceRefresh || false);
        const db = getDb();

        const channels = db.prepare(`
            SELECT id, name, stream_icon
            FROM playlist_items
            WHERE type = 'live' AND is_hidden = 0
        `).all();

        syncProgress.total = channels.length;

        const updateStmt = db.prepare(`
            UPDATE playlist_items
            SET stream_icon = ?
            WHERE id = ?
        `);

        const BATCH_SIZE = 500;
        const updateTransaction = db.transaction((updates) => {
            for (const { id, logo } of updates) {
                updateStmt.run(logo, id);
            }
        });

        let batch = [];
        for (let i = 0; i < channels.length; i++) {
            const ch = channels[i];
            syncProgress.processed++;

            const match = matchChannelLogo(ch.name);
            if (match && match.logo) {
                // Only update if icon is missing or different
                if (ch.stream_icon !== match.logo) {
                    batch.push({ id: ch.id, logo: match.logo });
                    syncProgress.updated++;
                } else {
                    syncProgress.skipped++;
                }
            } else {
                syncProgress.skipped++;
            }

            if (batch.length >= BATCH_SIZE) {
                updateTransaction(batch);
                batch = [];
            }
        }

        if (batch.length > 0) {
            updateTransaction(batch);
        }

        syncProgress.running = false;
        syncProgress.endTime = Date.now();
        console.log(`[ChannelLogoMatcher] Sync completed: ${syncProgress.updated} channels updated out of ${syncProgress.total}.`);
    } catch (err) {
        console.error('[ChannelLogoMatcher] Sync error:', err);
        syncProgress.running = false;
        syncProgress.error = err.message;
        syncProgress.endTime = Date.now();
    } finally {
        isSyncing = false;
    }

    return syncProgress;
}

function getSyncStatus() {
    return syncProgress;
}

module.exports = {
    cleanChannelName,
    matchChannelLogo,
    loadOrBuildLogoIndex,
    syncAllChannelLogos,
    getSyncStatus
};
