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

const COUNTRY_WORDS = [
    'MAROC', 'MOROCCO', 'FRANCE', 'ALGERIE', 'ALGERIA', 'TUNISIE', 'TUNISIA',
    'EGYPT', 'EGYPTE', 'LIBAN', 'LEBANON', 'ARABIA', 'SAUDI', 'QATAR', 'EMIRATES',
    'DUBAI', 'KSA', 'UAE', 'UK', 'USA', 'SPAIN', 'ESPAGNE', 'ITALY', 'ITALIE',
    'GERMANY', 'ALLEMAGNE', 'PORTUGAL', 'BELGIQUE', 'BELGIUM', 'SUISSE',
    'SWITZERLAND', 'TURKEY', 'TURQUIE', 'AFRIQUE', 'AFRICA', 'LATINO', 'INTER',
    'INTERNATIONAL', 'NATIONAL', 'MONDE', 'WORLD'
];

const COUNTRY_PRIORITY = ['FR', 'MA', 'DZ', 'TN', 'EG', 'SA', 'AE', 'QA', 'UK', 'US', 'ES', 'DE', 'IT'];

const KNOWN_CHANNEL_ALIASES = {
    'alaoula': ['alaoula', 'alaoulamaroc', 'snrt1', 'snrtaloula', 'la1ere'],
    'alaoulamaroc': ['alaoula', 'alaoulamaroc', 'snrt1'],
    'arryadia': ['arryadia', 'arriadia', 'snrt3', 'arryadiahd1', 'alriyadia'],
    'arrabiaa': ['arrabia', 'arrabiaa', 'athaqafia', 'snrt4'],
    'almaghribia': ['almaghribia', 'almaghribiya', 'snrt5'],
    'assadissa': ['assadissa', 'assadisa', 'snrt6'],
    'aflamtv': ['aflamtv', 'snrt7'],
    'tamazight': ['tamazight', 'tamazighttv', 'snrt8'],
    'medi1': ['medi1tvmaghreb', 'medi1tv', 'medi1tvarabic', 'medi1tvafrique'],
    'medi1tv': ['medi1tvmaghreb', 'medi1tv', 'medi1tvarabic', 'medi1tvafrique'],
    'chada': ['chadatv', 'chada'],
    'chadatv': ['chadatv', 'chada'],
    'telemaroc': ['telemaroc', 'telemaroctv'],
    'canal': ['canalplus', 'canalplusfrance'],
    'canalplus': ['canalplus', 'canalplusfrance'],
    'beinsport': ['beinsports', 'beinsport1', 'beinsports1'],
    'beinsports': ['beinsports', 'beinsport', 'beinsports1', 'beinsport1']
};

function cleanChannelName(raw) {
    if (!raw) return '';
    let name = String(raw).trim();

    // Remove decorative symbols, emojis and border characters
    name = name.replace(/^[#*=\-_~+•|/\\:;!?,.()\[\]{}◉●★☆▲▼◆◇■□✪✦✧✔✓🔴🎬🍿⚽🏆🥇🥈🥉📺📡🔴⚪🟢🟡🟣🔵⚫\s]+|[#*=\-_~+•|/\\:;!?,.()\[\]{}◉●★☆▲▼◆◇■□✪✦✧✔✓🔴🎬🍿⚽🏆🥇🥈🥉📺📡🔴⚪🟢🟡🟣🔵⚫\s]+$/g, '');

    // Normalize unicode characters (e.g. superscript ᵁᴴᴰ ³⁸⁴⁰ᴾ, accents)
    name = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

    // Strip common IPTV provider prefixes (e.g. "4K: ", "FR| ", "AR - ", "UK:", "[VIP]", "|FR|")
    name = name.replace(/^(\[.*?\]|\(.*?\)|\|.*?\|)\s*/i, '');
    name = name.replace(/^(4k|fhd|uhd|hd|sd|hevc|h265|vip|raw|premium|live|vod|series|event)[\s:|\-_]+/i, '');
    name = name.replace(/^(fr|ar|uk|us|es|it|de|pt|nl|be|ch|pl|tr|ca|ru|in|ma|dz|tn|sa|ae|eg|qa|kw)[\s:|\-_]+/i, '');
    name = name.replace(/^(4k|fhd|uhd|hd|sd|hevc|h265|vip)[\s:|\-_]+/i, '');

    // Strip common trailing resolution/event/codec badges
    name = name.replace(/[\s:|\-_]+(4k|fhd|uhd|hd|sd|hevc|h265|event|live|backup|vip|\(\d+\)|\[.*?\]|\(.*?\)).*$/i, '');
    name = name.replace(/[\s:|\-_]+(1080p|720p|50fps|60fps|h264|aac|raw).*$/i, '');

    // Collapse spaces and trim
    return name.replace(/\s+/g, ' ').trim();
}

function stripCountry(str) {
    if (!str) return '';
    let res = str;
    for (const c of COUNTRY_WORDS) {
        const reg = new RegExp('(^|\\s+)' + c + '(\\s+|$)', 'gi');
        res = res.replace(reg, ' ').trim();
    }
    return res.replace(/\s+/g, ' ').trim();
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

    // Sort channels giving priority to key markets
    const sortedChannels = [...(cacheData.channels || [])].sort((a, b) => {
        const pA = COUNTRY_PRIORITY.indexOf(a.country);
        const pB = COUNTRY_PRIORITY.indexOf(b.country);
        const valA = pA === -1 ? 999 : pA;
        const valB = pB === -1 ? 999 : pB;
        return valA - valB;
    });

    for (const c of sortedChannels) {
        const logo = logoById.get(c.id);
        if (!logo) continue;

        const idBase = c.id.replace(/\.[a-z]{2,3}$/i, '');
        const names = [c.name, ...(c.alt_names || []), idBase];
        for (const n of names) {
            if (!n) continue;
            const norm = normalizeKey(n);
            if (norm && (!exactMap.has(norm) || COUNTRY_PRIORITY.includes(c.country))) {
                exactMap.set(norm, { id: c.id, name: c.name, logo, country: c.country });
            }
            const clean = normalizeKey(cleanChannelName(n));
            if (clean && (!cleanMap.has(clean) || COUNTRY_PRIORITY.includes(c.country))) {
                cleanMap.set(clean, { id: c.id, name: c.name, logo, country: c.country });
            }
            const noCountry = normalizeKey(stripCountry(n));
            if (noCountry && !cleanMap.has(noCountry)) {
                cleanMap.set(noCountry, { id: c.id, name: c.name, logo, country: c.country });
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
    const addCandidate = (str) => {
        if (!str) return;
        const norm = typeof str === 'string' && /^[a-z0-9]+$/.test(str) ? str : normalizeKey(str);
        if (norm && !candidates.includes(norm)) {
            candidates.push(norm);
        }
    };

    // Tier 1: Raw & Direct Cleaned
    addCandidate(rawName);
    const cleaned = cleanChannelName(rawName);
    addCandidate(cleaned);

    // Tier 2: Country / Region Suffix Stripping (e.g. "2M MAROC" -> "2M", "AL AOULA MAROC" -> "AL AOULA")
    const noCountry = stripCountry(cleaned);
    if (noCountry && noCountry !== cleaned) {
        addCandidate(noCountry);
    }

    // Tier 3: Remove secondary qualifiers ("premium", "extra", "live", "event", "box office")
    const strippedQualifiers = cleaned
        .replace(/\b(premium|extra|live|event|feed|box\s*office)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (strippedQualifiers && strippedQualifiers !== cleaned) {
        addCandidate(strippedQualifiers);
        const sqNoCountry = stripCountry(strippedQualifiers);
        if (sqNoCountry) addCandidate(sqNoCountry);
    }

    // Tier 4: Number repositioning (e.g. "beIN Sports 1 Premium" -> "beIN Sports Premium 1")
    const numMatch = cleaned.match(/\b(\d+)\s+([a-z]+)\b/i);
    if (numMatch) {
        addCandidate(cleaned.replace(numMatch[0], `${numMatch[2]} ${numMatch[1]}`));
    }

    // Tier 5: Known Aliases & Transliterations
    for (const key of [...candidates]) {
        if (KNOWN_CHANNEL_ALIASES[key]) {
            for (const alt of KNOWN_CHANNEL_ALIASES[key]) {
                addCandidate(alt);
            }
        }
    }

    // Tier 6: Progressive Cascade - Rightmost Word Stripping (e.g. "BEIN SPORTS MAX 4" -> "BEIN SPORTS MAX" -> "BEIN SPORTS" -> "BEIN")
    const words = cleaned.split(/\s+/).filter(Boolean);
    for (let len = words.length - 1; len >= 1; len--) {
        const sub = words.slice(0, len).join(' ');
        const subNorm = normalizeKey(sub);
        if (subNorm.length >= 2) {
            addCandidate(subNorm);
            const subNoCountry = normalizeKey(stripCountry(sub));
            if (subNoCountry.length >= 2) addCandidate(subNoCountry);
            if (KNOWN_CHANNEL_ALIASES[subNorm]) {
                for (const alt of KNOWN_CHANNEL_ALIASES[subNorm]) addCandidate(alt);
            }
        }
    }

    // Tier 7: Plural/singular normalization (cinema <-> cinemas, sports <-> sport)
    const cleanNorm = normalizeKey(cleaned);
    const singular = cleanNorm.replace(/cinemas/g, 'cinema').replace(/sports/g, 'sport');
    if (singular !== cleanNorm) addCandidate(singular);
    const plural = cleanNorm.replace(/cinema(?![a-z])/g, 'cinemas').replace(/sport(?![a-z])/g, 'sports');
    if (plural !== cleanNorm) addCandidate(plural);

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

        // Auto-assign Package Spinner Covers from upgraded channel icons
        const packagesUpdated = syncAllPackageCovers(db);
        syncProgress.packagesUpdated = packagesUpdated;

        syncProgress.running = false;
        syncProgress.endTime = Date.now();
        console.log(`[ChannelLogoMatcher] Sync completed: ${syncProgress.updated} channels and ${packagesUpdated} package covers updated out of ${syncProgress.total}.`);
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

const DISCOVERED_COVERS_FILE = path.join(__dirname, '..', '..', 'data', 'package-discovered-covers.json');

function syncAllPackageCovers(db) {
    try {
        let discovered = {};
        try {
            if (fs.existsSync(DISCOVERED_COVERS_FILE)) {
                discovered = JSON.parse(fs.readFileSync(DISCOVERED_COVERS_FILE, 'utf8')) || {};
            }
        } catch (_) { discovered = {}; }

        let veloraData = null;
        try { veloraData = require('../routes/veloraData'); } catch (_) {}

        // 1. Fetch all admin_packages
        let allPackages = [];
        if (veloraData && typeof veloraData.allRows === 'function') {
            allPackages = veloraData.allRows('admin_packages') || [];
        } else {
            try {
                allPackages = db.prepare('SELECT * FROM admin_packages').all();
            } catch (_) { allPackages = []; }
        }

        const channelLookupStmt = db.prepare(`
            SELECT stream_icon, name
            FROM playlist_items
            WHERE type = 'live' AND category_id = ? AND stream_icon IS NOT NULL AND length(stream_icon) > 5 AND is_hidden = 0
            LIMIT 15
        `);

        let coversUpdated = 0;

        for (const pkg of allPackages) {
            if (pkg.kind && pkg.kind !== 'live') continue;

            const pkgId = String(pkg.id || '').trim();
            const catId = String(pkg.category_id || '').trim();
            const pkgName = String(pkg.name || pkg.original_name || '').trim();

            let bestLogo = pkg.cover_url && !pkg.cover_url.includes('tmdb.org') ? pkg.cover_url : '';

            // Step A: Brand name match on the package name (e.g. "FR| DAZN PPV" -> DAZN logo, "FR| CANAL+" -> Canal+ logo)
            if (!bestLogo && pkgName) {
                const brandMatch = matchChannelLogo(pkgName);
                if (brandMatch && brandMatch.logo) {
                    bestLogo = brandMatch.logo;
                }
            }

            // Step B: If no brand match, check channels inside this category
            if (!bestLogo && catId) {
                const channels = channelLookupStmt.all(catId);
                const officialMatch = channels.find(ch => 
                    ch.stream_icon && (
                        ch.stream_icon.includes('imgur') ||
                        ch.stream_icon.includes('wikimedia') ||
                        ch.stream_icon.includes('wikia') ||
                        ch.stream_icon.includes('github') ||
                        ch.stream_icon.includes('.png') ||
                        ch.stream_icon.includes('.svg')
                    ) && !ch.stream_icon.includes('tmdb.org')
                );

                if (officialMatch) {
                    bestLogo = officialMatch.stream_icon;
                } else if (channels[0]?.stream_icon && !channels[0].stream_icon.includes('tmdb.org')) {
                    bestLogo = channels[0].stream_icon;
                }
            }

            if (bestLogo) {
                if (pkgId) discovered[pkgId] = bestLogo;
                if (catId) discovered[catId] = bestLogo;
                if (pkgName) discovered[pkgName] = bestLogo;

                // Update package row if cover changed
                if (pkg.cover_url !== bestLogo) {
                    pkg.cover_url = bestLogo;
                    if (veloraData && typeof veloraData.saveRow === 'function') {
                        veloraData.saveRow('admin_packages', pkg);
                    }
                    coversUpdated++;
                }
            }
        }

        // 2. Also map raw category_ids from playlist_items
        const liveCategories = db.prepare(`
            SELECT category_id, MIN(name) as sample_name
            FROM playlist_items
            WHERE type = 'live' AND category_id IS NOT NULL AND is_hidden = 0
            GROUP BY category_id
        `).all();

        for (const cat of liveCategories) {
            const catId = String(cat.category_id || '').trim();
            if (!catId || discovered[catId]) continue;

            const channels = channelLookupStmt.all(catId);
            const officialMatch = channels.find(ch => 
                ch.stream_icon && (
                    ch.stream_icon.includes('imgur') ||
                    ch.stream_icon.includes('wikimedia') ||
                    ch.stream_icon.includes('wikia') ||
                    ch.stream_icon.includes('github') ||
                    ch.stream_icon.includes('.png') ||
                    ch.stream_icon.includes('.svg')
                ) && !ch.stream_icon.includes('tmdb.org')
            );
            if (officialMatch) {
                discovered[catId] = officialMatch.stream_icon;
            } else if (channels[0]?.stream_icon && !channels[0].stream_icon.includes('tmdb.org')) {
                discovered[catId] = channels[0].stream_icon;
            }
        }

        fs.mkdirSync(path.dirname(DISCOVERED_COVERS_FILE), { recursive: true });
        fs.writeFileSync(DISCOVERED_COVERS_FILE, JSON.stringify(discovered, null, 2), 'utf8');

        if (veloraData) {
            if (typeof veloraData.invalidateCountryPackageCache === 'function') {
                veloraData.invalidateCountryPackageCache();
            }
            if (typeof veloraData.buildCountryPackageCache === 'function') {
                veloraData.buildCountryPackageCache();
            }
            if (typeof veloraData.buildHomeCache === 'function') {
                veloraData.buildHomeCache();
            }
        }

        console.log(`[ChannelLogoMatcher] Auto-assigned ${coversUpdated} package spinner covers.`);
        return coversUpdated;
    } catch (err) {
        console.warn('[ChannelLogoMatcher] Failed to auto-sync package covers:', err.message);
        return 0;
    }
}

function getSyncStatus() {
    return syncProgress;
}

module.exports = {
    cleanChannelName,
    matchChannelLogo,
    loadOrBuildLogoIndex,
    syncAllChannelLogos,
    syncAllPackageCovers,
    getSyncStatus
};
