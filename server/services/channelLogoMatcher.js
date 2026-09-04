/**
 * channelLogoMatcher.js
 * Automated Live TV Channel Logo Matcher & Sync Engine using iptv-org open dataset.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { getDb } = require('../db/sqlite');
const { getOrFetchCachedImage } = require('./imageCache');

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

const COUNTRY_PRIORITY = ['FR', 'MA', 'QA', 'DZ', 'TN', 'EG', 'SA', 'AE', 'UK', 'US', 'ES', 'DE', 'IT'];

const JUNK_LOGO_URLS = new Set([
    'https://upload.wikimedia.org/wikipedia/commons/a/a8/Logo-asn.png',
    'https://i.imgur.com/ZZEvehR.png'
]);

const KNOWN_CHANNEL_ALIASES = {
    'bein': ['beinsports', 'beinsports1', 'beinsport', 'beinsport1', 'beinsports1hdfrance'],
    'beinsport': ['beinsports', 'beinsport1', 'beinsports1', 'beinsports1hdfrance'],
    'beinsports': ['beinsports', 'beinsport', 'beinsports1', 'beinsport1', 'beinsports1hdfrance'],
    'beinsport1': ['beinsports1', 'beinsport1', 'beinsports1hdfrance'],
    'beinsports1': ['beinsports1', 'beinsport1', 'beinsports1hdfrance'],
    'canal': ['canalplus', 'canalplusfrance'],
    'canalplus': ['canalplus', 'canalplusfrance'],
    'canalplusfoot': ['canalplusfoot', 'canalplusfootfrance'],
    'canalpluscinema': ['canalpluscinema', 'canalpluscinemas'],
    'canalpluscinemas': ['canalpluscinemas', 'canalpluscinema'],
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
    'telemaroc': ['telemaroc', 'telemaroctv']
};

function isLowPriorityCallsign(channel) {
    if (!channel) return false;
    const id = String(channel.id || '');
    const name = String(channel.name || '');
    if (/^[A-Z]{3,5}(?:LD|CD|DT|TV|LP)\d*\.[a-z]{2,3}$/i.test(id)) return true;
    if (/^[A-Z]{3,5}-(?:LD|CD|DT|TV|LP)\s*\d+/i.test(name)) return true;
    return false;
}

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

const CUSTOM_LOGOS_FILES = [
    path.join(__dirname, '..', '..', 'data', 'custom-logos.json'),
    path.join(__dirname, '..', '..', 'data', 'logos.json')
];

let customLogoUrls = new Set();
let customLogosLastMtime = 0;

function getCustomLogos() {
    const entries = [];
    customLogoUrls = new Set();
    let latestMtime = 0;

    for (const filePath of CUSTOM_LOGOS_FILES) {
        if (fs.existsSync(filePath)) {
            try {
                const stat = fs.statSync(filePath);
                if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;
                const fileContent = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
                const raw = JSON.parse(fileContent);
                if (Array.isArray(raw)) {
                    for (const item of raw) {
                        if (!item) continue;
                        const name = String(item.name || item.channel || item.id || '').trim();
                        const url = String(item.logo || item.url || item.image || '').trim();
                        const aliases = Array.isArray(item.aliases) ? item.aliases : (item.alt_names || []);
                        if (name && url) {
                            entries.push({ name, url, aliases, country: item.country || 'CUSTOM' });
                            customLogoUrls.add(url);
                        }
                    }
                } else if (typeof raw === 'object' && raw !== null) {
                    for (const [key, val] of Object.entries(raw)) {
                        if (!key || key.startsWith('_') || key.startsWith('//') || !val) continue;
                        if (typeof val === 'string') {
                            const trimmed = val.trim();
                            if (trimmed) {
                                entries.push({ name: key, url: trimmed, aliases: [], country: 'CUSTOM' });
                                customLogoUrls.add(trimmed);
                            }
                        } else if (typeof val === 'object') {
                            const url = String(val.logo || val.url || val.image || '').trim();
                            const aliases = Array.isArray(val.aliases) ? val.aliases : [];
                            if (url) {
                                entries.push({ name: key, url, aliases, country: val.country || 'CUSTOM' });
                                customLogoUrls.add(url);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn(`[ChannelLogoMatcher] Error reading custom logos from ${filePath}:`, e.message);
            }
        }
    }
    customLogosLastMtime = latestMtime;
    return entries;
}

const MAIN_CUSTOM_LOGOS_FILE = path.join(__dirname, '..', '..', 'data', 'custom-logos.json');

function readRawCustomLogosFile() {
    if (fs.existsSync(MAIN_CUSTOM_LOGOS_FILE)) {
        try {
            const content = fs.readFileSync(MAIN_CUSTOM_LOGOS_FILE, 'utf8').replace(/^\uFEFF/, '');
            return JSON.parse(content);
        } catch (e) {
            console.warn('[ChannelLogoMatcher] Error reading raw custom-logos.json:', e.message);
        }
    }
    return {};
}

function writeRawCustomLogosFile(obj) {
    fs.mkdirSync(path.dirname(MAIN_CUSTOM_LOGOS_FILE), { recursive: true });
    fs.writeFileSync(MAIN_CUSTOM_LOGOS_FILE, JSON.stringify(obj, null, 2), 'utf8');
    customLogosLastMtime = Date.now();
    if (inMemoryIndex) {
        applyCustomLogosToIndex(inMemoryIndex.exactMap, inMemoryIndex.cleanMap);
    }
}

function saveCustomLogo({ name, url, aliases = [], country = '' }) {
    if (!name || !url) throw new Error('Le nom et l’URL du logo sont obligatoires.');
    const raw = readRawCustomLogosFile();
    const cleanAliases = Array.isArray(aliases)
        ? aliases.map(a => String(a).trim()).filter(Boolean)
        : String(aliases || '').split(/[,;\n]+/).map(a => a.trim()).filter(Boolean);

    if (Array.isArray(raw)) {
        const existingIdx = raw.findIndex(item => item && (String(item.name || item.channel || '').toLowerCase() === name.trim().toLowerCase()));
        const entry = { name: name.trim(), logo: url.trim(), aliases: cleanAliases };
        if (country) entry.country = country.trim().toUpperCase();
        if (existingIdx >= 0) {
            raw[existingIdx] = entry;
        } else {
            raw.push(entry);
        }
        writeRawCustomLogosFile(raw);
    } else {
        const entryObj = {
            logo: url.trim(),
            ...(cleanAliases.length ? { aliases: cleanAliases } : {}),
            ...(country ? { country: country.trim().toUpperCase() } : {})
        };
        raw[name.trim()] = cleanAliases.length || country ? entryObj : url.trim();
        writeRawCustomLogosFile(raw);
    }
    if (typeof url === 'string' && url.startsWith('http')) {
        getOrFetchCachedImage(url).catch(() => {});
    }
    return getCustomLogos();
}

function deleteCustomLogo(name) {
    if (!name) throw new Error('Nom requis');
    const raw = readRawCustomLogosFile();
    const target = name.trim().toLowerCase();
    if (Array.isArray(raw)) {
        const filtered = raw.filter(item => item && String(item.name || item.channel || '').toLowerCase() !== target);
        writeRawCustomLogosFile(filtered);
    } else if (typeof raw === 'object' && raw !== null) {
        for (const key of Object.keys(raw)) {
            if (key.toLowerCase() === target) {
                delete raw[key];
            }
        }
        writeRawCustomLogosFile(raw);
    }
    return getCustomLogos();
}

function saveCustomLogosBulk(bulkData) {
    let parsed = bulkData;
    if (typeof bulkData === 'string') {
        parsed = JSON.parse(bulkData.replace(/^\uFEFF/, ''));
    }
    if (typeof parsed !== 'object' || parsed === null) throw new Error('Format JSON invalide');
    writeRawCustomLogosFile(parsed);
    return getCustomLogos();
}

function applyCustomLogosToIndex(exactMap, cleanMap) {
    const customEntries = getCustomLogos();
    for (const item of customEntries) {
        const names = [item.name, ...(item.aliases || [])];
        for (const n of names) {
            if (!n) continue;
            const norm = normalizeKey(n);
            if (norm) {
                exactMap.set(norm, { id: `custom.${norm}`, name: item.name, logo: item.url, country: item.country });
            }
            const clean = normalizeKey(cleanChannelName(n));
            if (clean) {
                cleanMap.set(clean, { id: `custom.${clean}`, name: item.name, logo: item.url, country: item.country });
            }
            const noCountry = normalizeKey(stripCountry(n));
            if (noCountry) {
                cleanMap.set(noCountry, { id: `custom.${noCountry}`, name: item.name, logo: item.url, country: item.country });
            }
        }
    }
}

function checkCustomLogosUpdate() {
    let latestMtime = 0;
    for (const filePath of CUSTOM_LOGOS_FILES) {
        if (fs.existsSync(filePath)) {
            try {
                const stat = fs.statSync(filePath);
                if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;
            } catch (_) {}
        }
    }
    if (latestMtime !== customLogosLastMtime && inMemoryIndex) {
        applyCustomLogosToIndex(inMemoryIndex.exactMap, inMemoryIndex.cleanMap);
    }
}

function isCustomLogoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (!inMemoryIndex) ensureIndexLoaded();
    return customLogoUrls.has(url.trim());
}

function buildIndexFromCacheData(cacheData) {
    if (!cacheData || !cacheData.channels || !cacheData.logos) return null;
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
        if (!logo || JUNK_LOGO_URLS.has(logo)) continue;

        const isCallsign = isLowPriorityCallsign(c);
        const idBase = c.id.replace(/\.[a-z]{2,3}$/i, '');
        const names = [c.name, ...(c.alt_names || []), idBase];
        for (const n of names) {
            if (!n) continue;
            const norm = normalizeKey(n);
            if (!norm) continue;
            // Skip short/generic single-word keys from US local repeater callsigns (e.g. WHDC-LD shouldn't claim "bein")
            if (isCallsign && (norm.length < 8 || ['bein', 'sports', 'sport', 'plus', 'extra'].includes(norm))) continue;

            if (!exactMap.has(norm) || COUNTRY_PRIORITY.includes(c.country)) {
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

    // Apply custom logos on top with highest priority
    applyCustomLogosToIndex(exactMap, cleanMap);

    inMemoryIndex = { exactMap, cleanMap, totalIndexed: exactMap.size };
    console.log(`[ChannelLogoMatcher] Indexed ${inMemoryIndex.totalIndexed} TV channel logo mappings (including custom logos).`);
    return inMemoryIndex;
}

function ensureIndexLoaded() {
    if (inMemoryIndex) {
        checkCustomLogosUpdate();
        return inMemoryIndex;
    }
    if (fs.existsSync(CACHE_FILE)) {
        try {
            const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            return buildIndexFromCacheData(cacheData);
        } catch (_) {}
    }
    return null;
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

    return buildIndexFromCacheData(cacheData);
}

function matchChannelLogo(rawName, countryHint = '') {
    if (!inMemoryIndex) ensureIndexLoaded();
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
            SELECT id, name, stream_icon, category_id
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

        const matchedChannels = new Set();
        let batch = [];
        for (let i = 0; i < channels.length; i++) {
            const ch = channels[i];
            syncProgress.processed++;

            const match = matchChannelLogo(ch.name);
            if (match && match.logo) {
                matchedChannels.add(ch.id);
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
            batch = [];
        }

        // Auto-assign Package Spinner Covers from upgraded channel icons
        const packagesUpdated = syncAllPackageCovers(db);
        syncProgress.packagesUpdated = packagesUpdated;

        // Fallback pass: Channels that still don't have a logo inherit their package's cover (NEVER country flags)
        let discovered = {};
        try {
            if (fs.existsSync(DISCOVERED_COVERS_FILE)) {
                discovered = JSON.parse(fs.readFileSync(DISCOVERED_COVERS_FILE, 'utf8')) || {};
            }
        } catch (_) {}

        const isCountryFlag = (url) => typeof url === 'string' && (url.includes('flagcdn.com') || url.includes('/flags/') || url.includes('country_') || url.includes('/logos/arabe.svg'));

        for (const ch of channels) {
            if (matchedChannels.has(ch.id)) continue;
            const currentIcon = String(ch.stream_icon || '').trim();
            const hasExplicitIcon = currentIcon && !isCountryFlag(currentIcon) && (
                currentIcon.includes('iptv-org') ||
                currentIcon.includes('github') ||
                currentIcon.includes('wikimedia') ||
                currentIcon.includes('/uploads/') ||
                isCustomLogoUrl(currentIcon)
            );

            if (!hasExplicitIcon) {
                const catId = String(ch.category_id || '').trim();
                const pkgCover = (catId && discovered[catId]) ? (typeof discovered[catId] === 'string' ? discovered[catId] : discovered[catId]?.coverUrl) : '';
                if (pkgCover && !isCountryFlag(pkgCover) && pkgCover !== currentIcon) {
                    batch.push({ id: ch.id, logo: pkgCover });
                    syncProgress.updated++;
                }
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

const COUNTRY_FLAG_CODES = {
    afghanistan: 'af',
    afrique_du_sud: 'za',
    albanie: 'al',
    algerie: 'dz',
    allemagne: 'de',
    angleterre: 'gb',
    arabie_saoudite: 'sa',
    argentine: 'ar',
    armenie: 'am',
    australie: 'au',
    autriche: 'at',
    azerbaidjan: 'az',
    bahrein: 'bh',
    bangladesh: 'bd',
    belgique: 'be',
    bielorussie: 'by',
    bolivie: 'bo',
    bosnie: 'ba',
    bosnie_herzegovine: 'ba',
    bresil: 'br',
    bulgarie: 'bg',
    cameroun: 'cm',
    canada: 'ca',
    chili: 'cl',
    chine: 'cn',
    chypre: 'cy',
    colombie: 'co',
    congo: 'cg',
    congo_gabon: 'cg',
    coree_du_sud: 'kr',
    costa_rica: 'cr',
    croatie: 'hr',
    cuba: 'cu',
    danemark: 'dk',
    ecosse: 'gb-sct',
    egypte: 'eg',
    emirats_arabes_unis: 'ae',
    equateur: 'ec',
    espagne: 'es',
    estonie: 'ee',
    etats_unis: 'us',
    usa: 'us',
    finlande: 'fi',
    france: 'fr',
    gabon: 'ga',
    georgie: 'ge',
    ghana: 'gh',
    grece: 'gr',
    guatemala: 'gt',
    honduras: 'hn',
    hong_kong: 'hk',
    hongrie: 'hu',
    inde: 'in',
    indonesie: 'id',
    irak: 'iq',
    iran: 'ir',
    irlande: 'ie',
    islande: 'is',
    israel: 'il',
    italie: 'it',
    japon: 'jp',
    jordanie: 'jo',
    kazakhstan: 'kz',
    kosovo: 'xk',
    koweit: 'kw',
    kurdistan: 'iq',
    laos: 'la',
    lettonie: 'lv',
    liban: 'lb',
    libye: 'ly',
    lituanie: 'lt',
    luxembourg: 'lu',
    macedoine: 'mk',
    macedoine_du_nord: 'mk',
    malaisie: 'my',
    mali: 'ml',
    malte: 'mt',
    maroc: 'ma',
    maurice: 'mu',
    mauritanie: 'mr',
    mexique: 'mx',
    monaco: 'mc',
    montenegro: 'me',
    namibie: 'na',
    nepal: 'np',
    nicaragua: 'ni',
    nigeria: 'ng',
    norvege: 'no',
    nouvelle_zelande: 'nz',
    oman: 'om',
    ouzbekistan: 'uz',
    pakistan: 'pk',
    palestine: 'ps',
    panama: 'pa',
    paraguay: 'py',
    pays_bas: 'nl',
    pays_de_galles: 'gb-wls',
    perou: 'pe',
    philippines: 'ph',
    pologne: 'pl',
    portugal: 'pt',
    qatar: 'qa',
    republique_dominicaine: 'do',
    republique_tcheque: 'cz',
    roumanie: 'ro',
    royaume_uni: 'gb',
    uk: 'gb',
    russie: 'ru',
    salvador: 'sv',
    senegal: 'sn',
    serbie: 'rs',
    slovaquie: 'sk',
    slovenie: 'si',
    somalie: 'so',
    soudan: 'sd',
    sri_lanka: 'lk',
    suede: 'se',
    suisse: 'ch',
    suriname: 'sr',
    syrie: 'sy',
    taiwan: 'tw',
    thailande: 'th',
    tunisie: 'tn',
    turquie: 'tr',
    ukraine: 'ua',
    uruguay: 'uy',
    venezuela: 've',
    vietnam: 'vn',
    yemen: 'ye'
};

const COUNTRY_LOGOS_FILE = path.join(__dirname, '..', '..', 'data', 'country-logos.json');

function getCountryFlagOrLogo(countryId, countryName = '') {
    try {
        if (fs.existsSync(COUNTRY_LOGOS_FILE)) {
            const map = JSON.parse(fs.readFileSync(COUNTRY_LOGOS_FILE, 'utf8'));
            if (countryId && map[countryId]?.path) return map[countryId].path;
            if (countryName && map[countryName]?.path) return map[countryName].path;
        }
    } catch (_) {}

    const raw = String(countryName || countryId || '').replace(/^country_/, '');
    const k = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

    if (k === 'arabe') return '/logos/arabe.svg';
    const code = COUNTRY_FLAG_CODES[k];
    if (code) return `https://flagcdn.com/w160/${code}.png`;
    return '';
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

        // 1. Fetch all admin_packages and admin_countries
        let allPackages = [];
        let allCountries = [];
        if (veloraData && typeof veloraData.allRows === 'function') {
            allPackages = veloraData.allRows('admin_packages') || [];
            allCountries = veloraData.allRows('admin_countries') || [];
        } else {
            try {
                allPackages = db.prepare('SELECT * FROM admin_packages').all();
            } catch (_) { allPackages = []; }
        }

        const countryById = new Map(allCountries.map(c => [String(c.id), c]));

        const channelLookupStmt = db.prepare(`
            SELECT stream_icon, name
            FROM playlist_items
            WHERE type = 'live' AND category_id = ? AND is_hidden = 0
            LIMIT 25
        `);

        let coversUpdated = 0;

        for (const pkg of allPackages) {
            if (pkg.kind && pkg.kind !== 'live') continue;

            const pkgId = String(pkg.id || '').trim();
            const catId = String(pkg.category_id || '').trim();
            const pkgName = String(pkg.name || pkg.original_name || '').trim();
            const countryName = countryById.get(String(pkg.country_id))?.name || pkg.country_name || '';

            let bestLogo = '';

            // Step A: Brand name match on the package name (e.g. "FR| DAZN PPV" -> DAZN logo, "FR| CANAL+" -> Canal+ logo)
            if (pkgName) {
                const brandMatch = matchChannelLogo(pkgName);
                if (brandMatch && brandMatch.logo) {
                    bestLogo = brandMatch.logo;
                }
            }

            // Step B: Fallback to country flag / logo if not found in brand match (never channel logos)
            if (!bestLogo) {
                bestLogo = getCountryFlagOrLogo(pkg.country_id, countryName);
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

        console.log(`[ChannelLogoMatcher] Auto-assigned ${coversUpdated} package spinner covers (with country flag fallback).`);
        return coversUpdated;
    } catch (err) {
        console.warn('[ChannelLogoMatcher] Failed to auto-sync package covers:', err.message);
        return 0;
    }
}

async function searchLogos(query, limit = 60) {
    const term = String(query || '').trim().toLowerCase();
    if (!term) return [];

    try {
        await loadOrBuildLogoIndex(false);
    } catch (_) {}

    let cacheData = null;
    if (fs.existsSync(CACHE_FILE)) {
        try {
            cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        } catch (_) {}
    }

    const channelById = new Map();
    if (cacheData && Array.isArray(cacheData.channels)) {
        for (const c of cacheData.channels) {
            if (c && c.id) channelById.set(c.id, c);
        }
    }

    const results = [];
    const seenUrls = new Set();

    // 1. First priority: Search in custom logos
    const customEntries = getCustomLogos();
    for (const item of customEntries) {
        if (!item || !item.url) continue;
        const nMatch = (item.name && item.name.toLowerCase().includes(term));
        const aMatch = (item.aliases || []).some(a => String(a).toLowerCase().includes(term));
        const cMatch = (item.country && item.country.toLowerCase().includes(term));
        const uMatch = (item.url && item.url.toLowerCase().includes(term));

        if (nMatch || aMatch || cMatch || uMatch) {
            if (!seenUrls.has(item.url)) {
                seenUrls.add(item.url);
                results.push({
                    name: item.name,
                    id: `custom.${item.name}`,
                    url: item.url,
                    country: item.country || 'CUSTOM',
                    source: 'custom'
                });
            }
        }
    }

    // 2. Second priority: Search in iptv-org logos
    if (cacheData && Array.isArray(cacheData.logos)) {
        for (const l of cacheData.logos) {
            if (!l || !l.url || JUNK_LOGO_URLS.has(l.url)) continue;
            if (seenUrls.has(l.url)) continue;

            const ch = l.channel ? channelById.get(l.channel) : null;
            const chName = ch ? String(ch.name || '') : '';
            const chId = String(l.channel || '');
            const chCountry = ch ? String(ch.country || '') : '';
            const altNames = ch && Array.isArray(ch.alt_names) ? ch.alt_names : [];

            let matches = false;
            if (chName.toLowerCase().includes(term)) matches = true;
            else if (chId.toLowerCase().includes(term)) matches = true;
            else if (altNames.some(a => String(a).toLowerCase().includes(term))) matches = true;
            else if (l.url.toLowerCase().includes(term)) matches = true;

            if (matches) {
                seenUrls.add(l.url);
                results.push({
                    name: chName || chId,
                    id: chId,
                    url: l.url,
                    country: chCountry,
                    source: 'iptv-org'
                });
                if (results.length >= limit) break;
            }
        }
    }

    return results;
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
    getCountryFlagOrLogo,
    getSyncStatus,
    isCustomLogoUrl,
    getCustomLogos,
    saveCustomLogo,
    deleteCustomLogo,
    saveCustomLogosBulk,
    readRawCustomLogosFile,
    searchLogos
};

// Preload index immediately on startup
try {
    ensureIndexLoaded();
    if (!inMemoryIndex) {
        loadOrBuildLogoIndex().catch(() => {});
    }
} catch (_) {}

