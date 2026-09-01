const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/sqlite');
const { sources } = require('../db');
const xtreamApi = require('../services/xtreamApi');
const veloraCatalogCache = require('../services/veloraCatalogCache');

const router = express.Router();
const homeCachePath = path.join(__dirname, '..', '..', 'data', 'velora-cache', 'home-sections.json');
const HOME_CACHE_ENTRIES_PER_PACKAGE = 20;
const countryPackageCachePath = path.join(
    __dirname, '..', '..', 'data', 'velora-cache', 'country-packages.json'
);
const vodPosterCachePath = path.join(__dirname, '..', '..', 'data', 'vod-poster-cache.json');
const vodBackdropCachePath = path.join(__dirname, '..', '..', 'data', 'vod-backdrop-cache.json');
const mediaFeedCachePath = path.join(__dirname, '..', '..', 'data', 'velora-cache', 'media-feed-cache.json');
const MEDIA_FEED_ENTRIES_PER_PACKAGE = 20;
let currentMediaFeedCache = null;
const https = require('https');

function cleanMediaTitleForSearch(raw) {
    let title = String(raw || '').trim();
    for (let i = 0; i < 5; i++) {
        title = title
            .replace(/^[\[\(]?[A-Z0-9\+\-\s]+[\]\)]\s*[-:]?\s*/i, '')
            .replace(/^([0-9]+K|[0-9]+D|HD|FHD|UHD|4K|VF|VOSTFR|VO|FR|EN|ES|DE|MULTI|TRUEFRENCH|FRENCH|HEVC|HDR|DOLBY|ATMOS)\s*[-:]?\s*/i, '')
            .replace(/^[A-Z0-9]{1,8}-[A-Z0-9]{1,8}\s*[-:]?\s*/i, '')
            .trim();
    }
    const yearMatch = title.match(/\((\d{4})\)/);
    const year = yearMatch ? yearMatch[1] : '';
    title = title.replace(/\(\d{4}\).*$/, '').replace(/[-:]\s*$/, '').trim();
    return { title, year };
}

function fetchTmdbBackdrop(name, isSeries = false) {
    const { title, year } = cleanMediaTitleForSearch(name);
    if (!title || title.length < 2) return Promise.resolve('');
    const endpoint = isSeries ? 'search/tv' : 'search/movie';
    const yearParam = year ? (isSeries ? `&first_air_date_year=${year}` : `&year=${year}`) : '';
    const url = `https://api.themoviedb.org/3/${endpoint}?api_key=1cf50e6248dc270629e802686245c2c8&query=${encodeURIComponent(title)}${yearParam}&language=fr-FR`;
    return new Promise((resolve) => {
        const req = https.get(url, { timeout: 3500 }, (res) => {
            if (res.statusCode !== 200) return resolve('');
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const item = json.results?.find(r => r.backdrop_path) || json.results?.[0];
                    if (item?.backdrop_path) {
                        return resolve(`https://image.tmdb.org/t/p/w780${item.backdrop_path}`);
                    }
                } catch (_) {}
                resolve('');
            });
        });
        req.on('error', () => resolve(''));
        req.on('timeout', () => { req.destroy(); resolve(''); });
    });
}

function fetchTmdbPoster(name, isSeries = false) {
    const { title, year } = cleanMediaTitleForSearch(name);
    if (!title || title.length < 2) return Promise.resolve('');
    const endpoint = isSeries ? 'search/tv' : 'search/movie';
    const yearParam = year ? (isSeries ? `&first_air_date_year=${year}` : `&year=${year}`) : '';
    const url = `https://api.themoviedb.org/3/${endpoint}?api_key=1cf50e6248dc270629e802686245c2c8&query=${encodeURIComponent(title)}${yearParam}&language=fr-FR`;
    return new Promise((resolve) => {
        const req = https.get(url, { timeout: 3500 }, (res) => {
            if (res.statusCode !== 200) return resolve('');
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const item = json.results?.find(r => r.poster_path) || json.results?.[0];
                    if (item?.poster_path) {
                        return resolve(`https://image.tmdb.org/t/p/w500${item.poster_path}`);
                    }
                } catch (_) {}
                resolve('');
            });
        });
        req.on('error', () => resolve(''));
        req.on('timeout', () => { req.destroy(); resolve(''); });
    });
}

async function resolveBackdropForEntry(entry, sourceMap, apiMap, backdropCache) {
    const sourceId = String(entry.sourceId || '');
    const streamId = String(entry.streamId || '');
    const key = `${sourceId}:${streamId}`;
    const titleKey = normalizedPosterTitle(entry.name);
    if (backdropCache[key]) return backdropCache[key];
    if (backdropCache[titleKey]) return backdropCache[titleKey];

    const isSeries = entry.contentType === 'series';
    let backdrop = '';

    const source = sourceId ? sourceMap.get(sourceId) : null;
    if (source && source.type === 'xtream' && streamId) {
        if (!apiMap.has(sourceId)) apiMap.set(sourceId, xtreamApi.createFromSource(source));
        try {
            const api = apiMap.get(sourceId);
            const details = await Promise.race([
                isSeries ? api.getSeriesInfo(streamId) : api.getVodInfo(streamId),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
            ]);
            let candidate = details?.info?.backdrop_path ?? details?.info?.backdrop ?? details?.movie_data?.backdrop_path ?? details?.series_info?.backdrop_path;
            if (Array.isArray(candidate) && candidate.length > 0) candidate = candidate[0];
            if (typeof candidate === 'string' && candidate.trim()) {
                candidate = candidate.trim();
                if (candidate.startsWith('/')) candidate = `https://image.tmdb.org/t/p/w780${candidate}`;
                backdrop = candidate;
            }
        } catch (_) {}
    }

    if (!backdrop && entry.name) {
        try {
            backdrop = await fetchTmdbBackdrop(entry.name, isSeries);
        } catch (_) {}
    }

    if (backdrop) {
        if (key && key !== ':') backdropCache[key] = backdrop;
        if (titleKey) backdropCache[titleKey] = backdrop;
    }
    return backdrop;
}

async function enrichHomeCacheBackdrops(payload) {
    const horizontalSections = (payload.sections || []).filter(section =>
        section?.card_orientation === 'horizontal' && (section.content_type === 'movies' || section.content_type === 'series')
    );
    if (!horizontalSections.length) return payload;

    let backdropCache = {};
    try { backdropCache = JSON.parse(fs.readFileSync(vodBackdropCachePath, 'utf8')) || {}; } catch (_) {}
    let sourceRows = [];
    try { sourceRows = await sources.getAll(); } catch (_) {}
    const sourceMap = new Map(sourceRows.map(source => [String(source.id), source]));
    const apiMap = new Map();
    let changed = false;

    const entries = horizontalSections.flatMap(section => Array.isArray(section.entries) ? section.entries : []);
    let cursor = 0;

    async function worker() {
        while (cursor < entries.length) {
            const entry = entries[cursor++];
            if (!entry) continue;
            const key = `${entry.sourceId || ''}:${entry.streamId || ''}`;
            const titleKey = normalizedPosterTitle(entry.name);
            let backdrop = backdropCache[key] || backdropCache[titleKey] || '';
            if (!backdrop) {
                backdrop = await resolveBackdropForEntry(entry, sourceMap, apiMap, backdropCache);
            }
            if (backdrop) {
                entry.thumbUrl = backdrop;
                entry.backdropUrl = backdrop;
                changed = true;
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(16, entries.length || 1) }, worker));
    if (changed) {
        try { fs.writeFileSync(vodBackdropCachePath, JSON.stringify(backdropCache, null, 2)); } catch (_) {}
    }
    return payload;
}
const COUNTRY_PACKAGE_TABLES = new Set([
    'admin_adult_packages',
    'admin_countries',
    'canonical_countries',
    'admin_country_package_order',
    'admin_package_channel_order',
    'admin_package_covers',
    'admin_packages',
    'admin_stream_curations'
]);
const HOME_CHANNEL_RULE_TABLES = new Set([
    'admin_channel_name_prefixes',
    'admin_channel_name_suffixes',
    'admin_hidden_filters'
]);
const DEFAULT_CHANNEL_HIDDEN_FILTERS = ['HEVC', 'H265', 'H.265', 'H 265', 'x265'];

let currentCountryPackageCache = null;

function removeCacheFile(filePath) {
    try {
        fs.rmSync(filePath, { force: true });
    } catch (error) {
        console.warn('[Velora data] Could not invalidate cache', filePath, error.message);
    }
}

function invalidateCountryPackageCache() {
    currentCountryPackageCache = null;
    currentMediaFeedCache = null;
    removeCacheFile(countryPackageCachePath);
    // Home sections and media feeds are derived views of the same package memberships.
    removeCacheFile(homeCachePath);
    removeCacheFile(mediaFeedCachePath);
}

function invalidateHomeCache() {
    removeCacheFile(homeCachePath);
}

function invalidateMediaFeedCache() {
    currentMediaFeedCache = null;
    removeCacheFile(mediaFeedCachePath);
}

function invalidateDerivedCachesForTable(table) {
    if (COUNTRY_PACKAGE_TABLES.has(table)) invalidateCountryPackageCache();
    else if (table === 'admin_home_sections' || HOME_CHANNEL_RULE_TABLES.has(table)) invalidateHomeCache();
}

function homeChannelNameRules() {
    const prefixes = [...new Set(allRows('admin_channel_name_prefixes')
        .map(row => String(row.prefix || '').trim()).filter(Boolean))]
        .sort((left, right) => right.length - left.length);
    const suffixes = [...new Set(allRows('admin_channel_name_suffixes')
        .map(row => String(row.suffix || '').trim()).filter(Boolean))]
        .sort((left, right) => right.length - left.length);
    const hiddenFilters = [...new Set([
        ...DEFAULT_CHANNEL_HIDDEN_FILTERS,
        ...allRows('admin_hidden_filters').map(row => String(row.needle || '').trim()).filter(Boolean)
    ])].sort((left, right) => right.length - left.length);
    return { prefixes, suffixes, hiddenFilters };
}

function normalizeChannelRuleValue(value) {
    return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function isHomeChannelHidden(rawName, hiddenFilters) {
    const name = normalizeChannelRuleValue(rawName);
    if ((name.match(/#/g) || []).length >= 3) return true;
    if (/^[-=*~_]{3,}.*[-=*~_]{3,}$/.test(name)) return true;
    return hiddenFilters.some(filter => {
        const normalized = normalizeChannelRuleValue(filter);
        if (normalized.startsWith('suffix:')) {
            const s = normalized.slice(7).trim();
            return s && (name.endsWith(s) || name.includes(s));
        }
        if (normalized.startsWith('prefix:')) {
            const p = normalized.slice(7).trim();
            return p && (name.startsWith(p) || name.includes(p));
        }
        return name.includes(normalized);
    });
}

function stripHomeChannelPrefixes(rawName, prefixes, suffixes = []) {
    const original = String(rawName || '').trim();
    let name = original;
    const allPrefixes = Array.isArray(prefixes) ? prefixes : [];
    const allSuffixes = Array.isArray(suffixes) ? suffixes : [];

    // Strip configured prefixes
    for (let pass = 0; pass < 32; pass += 1) {
        const prefix = allPrefixes.find(candidate =>
            candidate.length <= name.length
            && name.slice(0, candidate.length).toLowerCase() === candidate.toLowerCase()
        );
        if (!prefix) break;
        name = name.slice(prefix.length).trim();
        name = name.replace(/^[-:|•\s]+/g, '').trim();
    }

    // Strip configured suffixes
    for (let pass = 0; pass < 32; pass += 1) {
        const suffix = allSuffixes.find(candidate =>
            candidate.length <= name.length
            && name.slice(-candidate.length).toLowerCase() === candidate.toLowerCase()
        );
        if (!suffix) break;
        name = name.slice(0, -suffix.length).trim();
        name = name.replace(/[-:|•\s]+$/g, '').trim();
    }

    for (let p = 0; p < 5; p += 1) {
        const next = name
            .replace(/^[\[\(][A-Z0-9\+\-\s]{1,12}[\]\)]\s*[-:|•]?\s*/i, '')
            .replace(/^([0-9]+K|[0-9]+D|HD|FHD|UHD|4K|VF|VOSTFR|VO|FR|AR|EN|UK|US|ES|DE|IT|PT|TR|NL|RU|PL|RO|MULTI|TRUEFRENCH|FRENCH)(\s*[-:|•]\s*|\s+)/i, '')
            .replace(/\s*([\[\(][A-Z0-9\+\-\s]{1,12}[\]\)]|\b(HD|FHD|UHD|4K|VF|VOSTFR|VO|FR|AR|EN|UK|US|ES|DE|IT|PT|TR|NL|RU|PL|RO|MULTI|TRUEFRENCH|FRENCH)\b)$/i, '')
            .replace(/\s*[-:|•]\s*$/g, '')
            .trim();
        if (next === name || !next) break;
        name = next;
    }
    return name || original;
}

function normalizedPosterTitle(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/^\s*[^-]{1,14}\s+-\s+/, '').replace(/\s+/g, ' ').trim();
}

async function enrichHomeCacheMoviePosters(payload) {
    const movieEntries = payload.sections
        .filter(section => section?.content_type === 'movies')
        .flatMap(section => Array.isArray(section.entries) ? section.entries : []);
    const currentPosters = new Map();
    for (const item of veloraCatalogCache.getSnapshot('vod_streams') || []) {
        const poster = String(item.stream_icon || item.cover || item.cover_big || '').trim();
        const title = normalizedPosterTitle(item.name || item.title);
        if (poster && title && !currentPosters.has(title)) currentPosters.set(title, poster);
    }
    for (const entry of movieEntries) {
        if (String(entry?.thumbUrl || '').trim()) continue;
        const poster = currentPosters.get(normalizedPosterTitle(entry?.name));
        if (poster) entry.thumbUrl = poster;
    }
    const entries = movieEntries
        .filter(entry => entry?.sourceId && entry?.streamId && !String(entry.thumbUrl || '').trim());
    if (!entries.length) return payload;

    let posterCache = {};
    try { posterCache = JSON.parse(fs.readFileSync(vodPosterCachePath, 'utf8')) || {}; } catch (_) {}
    const sourceRows = await sources.getAll();
    const sourceMap = new Map(sourceRows.map(source => [String(source.id), source]));
    const apiMap = new Map();
    let cursor = 0;
    let changed = false;
    async function worker() {
        while (cursor < entries.length) {
            const entry = entries[cursor++];
            const sourceId = String(entry.sourceId);
            const streamId = String(entry.streamId);
            const key = `${sourceId}:${streamId}`;
            let poster = typeof posterCache[key] === 'string' ? posterCache[key] : '';
            if (!poster) {
                const source = sourceMap.get(sourceId);
                if (!source || source.type !== 'xtream') continue;
                if (!apiMap.has(sourceId)) apiMap.set(sourceId, xtreamApi.createFromSource(source));
                try {
                    const details = await Promise.race([
                        apiMap.get(sourceId).getVodInfo(streamId),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('poster timeout')), 2500))
                    ]);
                    poster = String(details?.info?.movie_image || details?.info?.cover_big || details?.movie_data?.stream_icon || '').trim();
                    if (poster) {
                        posterCache[key] = poster;
                        changed = true;
                    }
                } catch (_) {}
            }
            if (poster) entry.thumbUrl = poster;
        }
    }
    await Promise.all(Array.from({ length: Math.min(64, entries.length) }, worker));
    if (changed) fs.writeFileSync(vodPosterCachePath, JSON.stringify(posterCache));
    return payload;
}

const ALLOWED_TABLES = new Set([
    'admin_adult_packages',
    'admin_channel_name_prefixes',
    'admin_channel_name_suffixes',
    'admin_countries',
    'admin_country_package_order',
    'admin_global_package_allowlist',
    'admin_global_package_open_confirm',
    'admin_hero_slider',
    'admin_hidden_filters',
    'admin_home_sections',
    'admin_package_channel_order',
    'admin_package_covers',
    'admin_packages',
    'admin_settings',
    'admin_stream_curations',
    'canonical_countries'
]);

const NATURAL_KEYS = {
    admin_adult_packages: ['package_id'],
    admin_channel_name_prefixes: ['prefix'],
    admin_channel_name_suffixes: ['suffix'],
    admin_countries: ['name'],
    admin_country_package_order: ['country_id', 'ui_tab'],
    admin_global_package_allowlist: ['stream_id'],
    admin_global_package_open_confirm: ['id'],
    admin_hero_slider: ['id'],
    admin_home_sections: ['id'],
    admin_package_channel_order: ['country_id', 'package_id'],
    admin_package_covers: ['package_id'],
    admin_packages: ['id'],
    admin_settings: ['key'],
    admin_stream_curations: ['stream_id', 'country_id'],
    canonical_countries: ['match_key']
};

function normalizedPackageName(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Resolve old packages in memory without rewriting user data. Provider stream
// IDs are not globally unique; a legacy package must be tied to one provider
// before its curations can safely be exposed to the player.
function resolvedAdminPackages(packages, curations) {
    const db = getDb();
    const categories = db.prepare(`
        SELECT source_id, category_id, type, name
        FROM categories WHERE is_hidden = 0
    `).all();
    const orders = allRows('admin_country_package_order');
    const kindsByPackage = new Map();
    for (const order of orders) {
        const kind = order.ui_tab === 'movies' ? 'vod' : String(order.ui_tab || '');
        if (!['live', 'vod', 'series'].includes(kind)) continue;
        for (const packageId of Array.isArray(order.package_order) ? order.package_order : []) {
            const key = String(packageId);
            if (!kindsByPackage.has(key)) kindsByPackage.set(key, new Set());
            kindsByPackage.get(key).add(kind);
        }
    }
    const curationsByPackage = new Map();
    for (const row of curations) {
        const packageId = String(row.target_package_id || '');
        if (!curationsByPackage.has(packageId)) curationsByPackage.set(packageId, []);
        curationsByPackage.get(packageId).push(row);
    }
    const categoryByKey = new Map(categories.map(category => [
        `${category.source_id}\u001f${category.type}\u001f${category.category_id}`,
        category
    ]));

    function scoredCandidates(legacyIds, expectedKinds, providerPackageName) {
        if (!legacyIds.size) return [];
        const itemTypes = [...(expectedKinds || [])]
            .map(catalogueItemType)
            .filter(Boolean);
        const scores = new Map();
        const ids = [...legacyIds];
        for (let offset = 0; offset < ids.length; offset += 800) {
            const chunk = ids.slice(offset, offset + 800);
            const itemPlaceholders = chunk.map(() => '?').join(',');
            const typeClause = itemTypes.length
                ? ` AND type IN (${itemTypes.map(() => '?').join(',')})`
                : '';
            const rows = db.prepare(`
                SELECT source_id, type, category_id, COUNT(DISTINCT item_id) AS score
                FROM playlist_items
                WHERE is_hidden = 0 AND item_id IN (${itemPlaceholders})${typeClause}
                GROUP BY source_id, type, category_id
            `).all(...chunk, ...itemTypes);
            for (const row of rows) {
                const key = `${row.source_id}\u001f${row.type}\u001f${row.category_id}`;
                scores.set(key, (scores.get(key) || 0) + Number(row.score || 0));
            }
        }
        const wantedName = normalizedPackageName(providerPackageName);
        return [...scores.entries()].map(([key, score]) => {
            const category = categoryByKey.get(key);
            if (!category) return null;
            return {
                category,
                score,
                nameMatch: normalizedPackageName(category.name) === wantedName
            };
        }).filter(Boolean).sort((left, right) =>
            right.score - left.score ||
            Number(right.nameMatch) - Number(left.nameMatch)
        );
    }

    return packages.map(packageRow => {
        if (packageRow.is_parent === true || packageRow.is_parent === 'true') return packageRow;
        if (String(packageRow.source_id ?? '').trim()
            && String(packageRow.category_id ?? '').trim()
            && String(packageRow.kind ?? '').trim()) return packageRow;

        const packageId = String(packageRow.id);
        const expectedKinds = kindsByPackage.get(packageId);
        const legacyIds = new Set((curationsByPackage.get(packageId) || [])
            .map(row => String(row.stream_id || '')).filter(Boolean));
        const providerPackageName = String(packageRow.original_name || packageRow.name || '');
        const candidates = scoredCandidates(legacyIds, expectedKinds, providerPackageName);

        const best = candidates[0];
        const runnerUp = candidates[1];
        if (!best || best.score < 1 || (
            runnerUp && best.score === runnerUp.score && best.nameMatch === runnerUp.nameMatch
        )) {
            const onlyKind = expectedKinds?.size === 1 ? [...expectedKinds][0] : null;
            return onlyKind && !packageRow.kind ? { ...packageRow, kind: onlyKind } : packageRow;
        }
        return {
            ...packageRow,
            source_id: best.category.source_id,
            category_id: String(best.category.category_id),
            kind: best.category.type === 'movie' ? 'vod' : best.category.type,
            identity_inferred: true
        };
    });
}

function decodeValue(value) {
    try {
        return decodeURIComponent(String(value));
    } catch {
        return String(value);
    }
}

function parseIn(value) {
    const raw = value.slice(3, -1);
    return raw.split(',').map(part => decodeValue(part.replace(/^"|"$/g, '')));
}

function comparable(value) {
    if (value == null) return null;
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    return String(value);
}

function matches(row, query) {
    for (const [field, rawValue] of Object.entries(query)) {
        if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(field)) continue;
        const raw = String(rawValue);
        const actual = row[field];
        if (raw.startsWith('eq.')) {
            if (String(actual ?? '') !== decodeValue(raw.slice(3))) return false;
        } else if (raw.startsWith('neq.')) {
            if (String(actual ?? '') === decodeValue(raw.slice(4))) return false;
        } else if (raw === 'is.null') {
            if (actual != null) return false;
        } else if (raw === 'not.is.null') {
            if (actual == null) return false;
        } else if (raw.startsWith('like.')) {
            const pattern = decodeValue(raw.slice(5))
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .replace(/\\\*/g, '.*');
            if (!new RegExp(`^${pattern}$`, 'i').test(String(actual ?? ''))) return false;
        } else if (raw.startsWith('ilike.')) {
            const pattern = decodeValue(raw.slice(6))
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .replace(/\\\*/g, '.*');
            if (!new RegExp(`^${pattern}$`, 'i').test(String(actual ?? ''))) return false;
        } else if (raw.startsWith('in.(') && raw.endsWith(')')) {
            const values = parseIn(raw);
            if (!values.includes(String(actual ?? ''))) return false;
        }
    }
    return true;
}

function project(row, select) {
    if (!select || select === '*') return row;
    const fields = String(select).split(',').map(value => value.trim()).filter(Boolean);
    return Object.fromEntries(fields.map(field => [field, row[field]]));
}

function allRows(table) {
    return getDb().prepare(
        `SELECT row_id, data FROM velora_admin_rows WHERE table_name = ?`
    ).all(table).map(record => {
        const row = JSON.parse(record.data);
        if (!row.id) row.id = record.row_id;
        return row;
    });
}

function allRowsWithStorageMetadata(table) {
    return getDb().prepare(`
        SELECT row_id, data, updated_at, rowid AS storage_order
        FROM velora_admin_rows
        WHERE table_name = ?
        ORDER BY updated_at ASC, rowid ASC
    `).all(table).map(record => {
        const row = JSON.parse(record.data);
        if (!row.id) row.id = record.row_id;
        Object.defineProperties(row, {
            __veloraUpdatedAt: { value: String(record.updated_at || ''), enumerable: false },
            __veloraStorageOrder: { value: Number(record.storage_order) || 0, enumerable: false }
        });
        return row;
    });
}

function catalogueItemType(kind) {
    if (kind === 'vod' || kind === 'movies') return 'movie';
    return kind === 'live' || kind === 'series' ? kind : null;
}

/**
 * Return explicit curations plus current catalogue members for provider-backed
 * packages. An explicit curation for the same country/item wins, so moving an
 * item to another package (or the hidden package) is still respected.
 */
function effectiveCurations(packageIds = null, prepared = null) {
    const db = getDb();
    const rawCurations = prepared?.rawCurations || allRowsWithStorageMetadata('admin_stream_curations');
    const packages = prepared?.packages
        || resolvedAdminPackages(allRows('admin_packages'), rawCurations);
    const packageById = new Map(packages.map(row => [String(row.id), row]));

    // Resolve each distinct item/type pair in batches. Performing one synchronous
    // SQLite query per curation can block the event loop for minutes on large data.
    const candidates = [];
    const itemIdsByType = new Map();
    for (const row of rawCurations) {
        const packageRow = packageById.get(String(row.target_package_id || '')) || {};
        const kind = String(row.kind || packageRow.kind || '').trim();
        const itemType = catalogueItemType(kind);
        const streamId = String(row.stream_id || '').trim();
        if (!itemType || !streamId) continue;
        candidates.push({ row, kind, itemType, streamId, packageRow });
        if (!itemIdsByType.has(itemType)) itemIdsByType.set(itemType, new Set());
        itemIdsByType.get(itemType).add(streamId);
    }

    const matchesByItem = new Map();
    for (const [itemType, itemIds] of itemIdsByType) {
        const ids = [...itemIds];
        for (let offset = 0; offset < ids.length; offset += 800) {
            const chunk = ids.slice(offset, offset + 800);
            const placeholders = chunk.map(() => '?').join(',');
            const rows = db.prepare(`
                SELECT DISTINCT source_id, item_id, type
                FROM playlist_items
                WHERE type = ? AND item_id IN (${placeholders}) AND is_hidden = 0
            `).all(itemType, ...chunk);
            for (const item of rows) {
                const key = `${item.type}\u001f${item.item_id}`;
                if (!matchesByItem.has(key)) matchesByItem.set(key, []);
                matchesByItem.get(key).push(item);
            }
        }
    }

    const explicit = candidates.map(({ row, kind, itemType, streamId, packageRow }) => {
        const matches = matchesByItem.get(`${itemType}\u001f${streamId}`) || [];
        const preferredSource = String(row.source_id ?? packageRow.source_id ?? '').trim();
        const selected = preferredSource
            ? matches.find(item => String(item.source_id) === preferredSource)
            : matches.length === 1 ? matches[0] : null;
        if (!selected) return null;
        return {
            ...row,
            source_id: selected.source_id,
            kind: selected.type === 'movie' ? 'vod' : selected.type,
            __veloraUpdatedAt: String(row.__veloraUpdatedAt || ''),
            __veloraStorageOrder: Number(row.__veloraStorageOrder) || 0
        };
    }).filter(Boolean);
    const explicitByItem = new Map();
    for (const row of explicit) {
        const key = `${String(row.country_id || '')}:${row.kind}:${row.source_id}:${String(row.stream_id || '')}`;
        const previous = explicitByItem.get(key);
        if (!previous
            || row.__veloraUpdatedAt > previous.__veloraUpdatedAt
            || (row.__veloraUpdatedAt === previous.__veloraUpdatedAt
                && row.__veloraStorageOrder >= previous.__veloraStorageOrder)) {
            explicitByItem.set(key, row);
        }
    }
    explicit.length = 0;
    for (const selected of explicitByItem.values()) {
        delete selected.__veloraUpdatedAt;
        delete selected.__veloraStorageOrder;
        explicit.push(selected);
    }
    const explicitKeys = new Set();
    for (const row of explicit) {
        const countryId = String(row.country_id || '');
        const streamId = String(row.stream_id || '');
        if (!countryId || !streamId) continue;
        explicitKeys.add(`${countryId}:${row.kind}:${row.source_id}:${streamId}`);
    }

    const wanted = packageIds ? new Set([...packageIds].map(String)) : null;
    const effective = wanted
        ? explicit.filter(row => wanted.has(String(row.target_package_id || '')))
        : [...explicit];
    const listItems = db.prepare(`
        SELECT item_id
        FROM playlist_items
        WHERE source_id = ? AND type = ? AND category_id = ? AND is_hidden = 0
    `);
    for (const packageRow of packages) {
        const packageId = String(packageRow.id || '');
        if (wanted && !wanted.has(packageId)) continue;
        const countryId = String(packageRow.country_id || '');
        const sourceId = Number.parseInt(packageRow.source_id, 10);
        const categoryId = String(packageRow.category_id || '').trim();
        const kind = String(packageRow.kind || '').trim();
        const itemType = catalogueItemType(kind);
        if (!packageId || !countryId || !Number.isInteger(sourceId) || !categoryId || !itemType) continue;

        for (const item of listItems.all(sourceId, itemType, categoryId)) {
            const streamId = String(item.item_id);
            const sourceKey = `${countryId}:${kind}:${sourceId}:${streamId}`;
            if (explicitKeys.has(sourceKey)) continue;
            effective.push({
                id: `catalog:${packageId}:${sourceId}:${streamId}`,
                stream_id: streamId,
                country_id: countryId,
                target_package_id: packageId,
                source_id: sourceId,
                kind
            });
        }
    }
    return effective;
}

function compactMemberships(curations) {
    const countries = [];
    const packages = [];
    const countryIndexes = new Map();
    const packageIndexes = new Map();
    const indexFor = (value, values, indexes) => {
        const key = String(value || '');
        if (indexes.has(key)) return indexes.get(key);
        const index = values.length;
        values.push(key);
        indexes.set(key, index);
        return index;
    };
    const rows = [];
    for (const row of curations) {
        const countryId = String(row.country_id || '');
        const packageId = String(row.target_package_id || '');
        const streamId = String(row.stream_id ?? '').trim();
        if (!countryId || !packageId || !streamId) continue;
        rows.push([
            indexFor(countryId, countries, countryIndexes),
            streamId,
            indexFor(packageId, packages, packageIndexes),
            row.source_id ?? null,
            row.kind || null,
            row.origin_package_id || null
        ]);
    }
    return { countries, packages, rows };
}

function expandMemberships(compact) {
    const countries = Array.isArray(compact?.countries) ? compact.countries : [];
    const packages = Array.isArray(compact?.packages) ? compact.packages : [];
    return (Array.isArray(compact?.rows) ? compact.rows : []).map(row => ({
        country_id: countries[row[0]],
        stream_id: row[1],
        target_package_id: packages[row[2]],
        source_id: row[3] ?? null,
        kind: row[4] || null,
        origin_package_id: row[5] || null
    })).filter(row => row.country_id && row.target_package_id && row.stream_id !== '');
}

function writeJsonAtomic(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(payload));
    fs.renameSync(temporaryPath, filePath);
}

function buildCountryPackageCache() {
    const rawCurations = allRowsWithStorageMetadata('admin_stream_curations');
    const packages = resolvedAdminPackages(allRows('admin_packages'), rawCurations);
    const memberships = compactMemberships(effectiveCurations(null, { rawCurations, packages }));
    const countries = allRows('admin_countries');
    const prefixes = [...new Set(allRows('admin_channel_name_prefixes')
        .map(row => String(row.prefix || '').trim()).filter(Boolean))]
        .sort((left, right) => right.length - left.length);
    const hiddenFilters = [...new Set([
        ...DEFAULT_CHANNEL_HIDDEN_FILTERS,
        ...allRows('admin_hidden_filters').map(row => String(row.needle || '').trim()).filter(Boolean)
    ])];
    const payload = {
        version: 3,
        generatedAt: new Date().toISOString(),
        catalogSnapshotVersion: veloraCatalogCache.getStatus().snapshotVersion || null,
        countries,
        canonicalCountries: allRows('canonical_countries'),
        packages,
        packageOrders: allRows('admin_country_package_order'),
        packageChannelOrders: allRows('admin_package_channel_order'),
        packageCovers: allRows('admin_package_covers'),
        prefixes,
        hiddenFilters,
        memberships,
        counts: {
            countries: countries.length,
            packages: packages.length,
            memberships: memberships.rows.length
        }
    };
    writeJsonAtomic(countryPackageCachePath, payload);
    currentCountryPackageCache = payload;
    return payload;
}

function getCountryPackageCache() {
    const snapshotVersion = veloraCatalogCache.getStatus().snapshotVersion || null;
    if (currentCountryPackageCache?.catalogSnapshotVersion === snapshotVersion) {
        return currentCountryPackageCache;
    }
    currentCountryPackageCache = null;
    try {
        if (fs.existsSync(countryPackageCachePath)) {
            const payload = JSON.parse(fs.readFileSync(countryPackageCachePath, 'utf8'));
            if (payload?.version === 3 && payload.catalogSnapshotVersion === snapshotVersion) {
                currentCountryPackageCache = payload;
                return payload;
            }
        }
    } catch (error) {
        console.warn('[Velora data] Country/package cache read failed:', error.message);
    }
    return buildCountryPackageCache();
}

function liveChannelsForCurations(curations, packageById) {
    const findItem = getDb().prepare(`
        SELECT item_id, name, stream_icon, provider_order
        FROM playlist_items
        WHERE source_id = ? AND type = 'live' AND item_id = ? AND is_hidden = 0
    `);
    const seen = new Set();
    const channels = [];
    for (const curation of curations) {
        if (curation.kind !== 'live') continue;
        const sourceId = Number.parseInt(curation.source_id, 10);
        const streamId = String(curation.stream_id || '').trim();
        const packageId = String(curation.target_package_id || '').trim();
        const key = `${packageId}:${sourceId}:${streamId}`;
        if (!Number.isInteger(sourceId) || !streamId || seen.has(key)) continue;
        const item = findItem.get(sourceId, streamId);
        if (!item) continue;
        seen.add(key);
        channels.push({
            stream_id: streamId,
            source_id: sourceId,
            kind: 'live',
            origin_package_id: String(curation.origin_package_id || ''),
            name: item.name,
            stream_icon: item.stream_icon || '',
            provider_order: item.provider_order,
            package_id: packageId,
            package_name: packageById.get(packageId)?.name || packageId
        });
    }
    return channels.sort((left, right) => {
        const packageOrder = String(left.package_name).localeCompare(String(right.package_name), 'fr');
        if (packageOrder) return packageOrder;
        const a = Number.isFinite(left.provider_order) ? left.provider_order : Number.MAX_SAFE_INTEGER;
        const b = Number.isFinite(right.provider_order) ? right.provider_order : Number.MAX_SAFE_INTEGER;
        return a - b || String(left.name).localeCompare(String(right.name), 'fr');
    });
}

function mediaItemsForCurations(curations, packageById, kind) {
    const itemType = catalogueItemType(kind);
    if (kind !== 'vod' && kind !== 'series') return [];
    const findItem = getDb().prepare(`
        SELECT item_id, name, stream_icon, container_extension, provider_order
        FROM playlist_items
        WHERE source_id = ? AND type = ? AND item_id = ? AND is_hidden = 0
    `);
    const seen = new Set();
    const items = [];
    for (const curation of curations) {
        if (curation.kind !== kind) continue;
        const sourceId = Number.parseInt(curation.source_id, 10);
        const streamId = String(curation.stream_id || '').trim();
        const packageId = String(curation.target_package_id || '').trim();
        const key = `${packageId}:${sourceId}:${streamId}`;
        if (!Number.isInteger(sourceId) || !streamId || seen.has(key)) continue;
        const item = findItem.get(sourceId, itemType, streamId);
        if (!item) continue;
        seen.add(key);
        items.push({
            stream_id: streamId,
            source_id: sourceId,
            kind,
            origin_package_id: String(curation.origin_package_id || ''),
            name: item.name,
            stream_icon: item.stream_icon || '',
            container_extension: item.container_extension || '',
            provider_order: item.provider_order,
            package_id: packageId,
            package_name: packageById.get(packageId)?.name || packageId
        });
    }
    return items.sort((left, right) => {
        const packageOrder = String(left.package_name).localeCompare(String(right.package_name), 'fr');
        if (packageOrder) return packageOrder;
        const a = Number.isFinite(left.provider_order) ? left.provider_order : Number.MAX_SAFE_INTEGER;
        const b = Number.isFinite(right.provider_order) ? right.provider_order : Number.MAX_SAFE_INTEGER;
        return a - b || String(left.name).localeCompare(String(right.name), 'fr');
    });
}

function isEditableLivePackage(packageRow, countryId) {
    return packageRow
        && String(packageRow.country_id || '') === String(countryId || '')
        && packageRow.kind === 'live'
        && packageRow.is_parent !== true
        && packageRow.is_parent !== 'true';
}

function isEditableMediaPackage(packageRow, countryId, kind) {
    return packageRow
        && String(packageRow.country_id || '') === String(countryId || '')
        && (kind === 'vod' || kind === 'series')
        && packageRow.kind === kind
        && packageRow.is_parent !== true
        && packageRow.is_parent !== 'true';
}

function prepareMediaCuration(
    { countryId, sourceId, streamId, targetPackageId, originPackageId, kind },
    packageById,
    rawCurations
) {
    const matching = rawCurations.filter(row => {
        if (String(row.country_id || '') !== countryId || String(row.stream_id || '') !== streamId) return false;
        const currentPackage = packageById.get(String(row.target_package_id || '')) || {};
        const rowSourceId = Number.parseInt(row.source_id ?? currentPackage.source_id, 10);
        const rowKind = String(row.kind || currentPackage.kind || '');
        return rowSourceId === sourceId && rowKind === kind;
    });
    const existing = matching.find(row => Number.parseInt(row.source_id, 10) === sourceId && row.kind === kind)
        || matching[0];
    const id = String(existing?.id || crypto.randomUUID());
    const numericStreamId = /^\d+$/.test(streamId) ? Number(streamId) : streamId;
    const row = {
        ...(existing || {}),
        id,
        stream_id: numericStreamId,
        country_id: countryId,
        target_package_id: targetPackageId,
        source_id: sourceId,
        kind,
        origin_package_id: originPackageId || null
    };
    return { row, duplicateIds: matching.filter(duplicate => String(duplicate.id) !== id).map(duplicate => String(duplicate.id)) };
}

function saveMediaCurations(updates, packages, rawCurations) {
    const packageById = new Map(packages.map(row => [String(row.id), row]));
    const prepared = updates.map(update => prepareMediaCuration(update, packageById, rawCurations));
    const db = getDb();
    db.transaction(() => {
        const remove = db.prepare(`
            DELETE FROM velora_admin_rows WHERE table_name = 'admin_stream_curations' AND row_id = ?
        `);
        const upsert = db.prepare(`
            INSERT INTO velora_admin_rows (table_name, row_id, data, updated_at)
            VALUES ('admin_stream_curations', ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(table_name, row_id) DO UPDATE SET
                data = excluded.data,
                updated_at = CURRENT_TIMESTAMP
        `);
        for (const { row, duplicateIds } of prepared) {
            for (const duplicateId of duplicateIds) remove.run(duplicateId);
            upsert.run(String(row.id), JSON.stringify(row));
        }
    })();
    return prepared.map(entry => entry.row);
}

function saveMediaCuration(args, packages, rawCurations) {
    return saveMediaCurations([args], packages, rawCurations)[0];
}

function saveChannelCuration(args, packages, rawCurations) {
    return saveMediaCuration({ ...args, kind: 'live' }, packages, rawCurations);
}

function sortRows(rows, order) {
    if (!order) return rows;
    const clauses = String(order).split(',').map(value => {
        const [field, direction] = value.split('.');
        return { field, direction: direction === 'desc' ? -1 : 1 };
    });
    return rows.sort((left, right) => {
        for (const clause of clauses) {
            const a = comparable(left[clause.field]);
            const b = comparable(right[clause.field]);
            if (a === b) continue;
            if (a == null) return 1;
            if (b == null) return -1;
            return (a < b ? -1 : 1) * clause.direction;
        }
        return 0;
    });
}

function conflictFields(table, req) {
    const requested = String(req?.query?.on_conflict || '')
        .split(',').map(value => value.trim()).filter(Boolean);
    return requested.length ? requested : (NATURAL_KEYS[table] || ['id']);
}

function findConflict(table, row, fields) {
    if (!fields.length || fields.some(field => row[field] == null)) return null;
    return allRows(table).find(candidate =>
        fields.every(field => String(candidate[field]) === String(row[field]))
    ) || null;
}

function saveRow(table, input, req = null) {
    const db = getDb();
    const row = { ...input };
    const merge = req && typeof req.get === 'function'
        ? String(req.get('Prefer') || '').includes('resolution=merge-duplicates')
        : false;
    const conflict = findConflict(table, row, conflictFields(table, req));
    if (conflict && merge) Object.assign(row, conflict, input);
    const rowId = String(row.id || (conflict && conflict.id) || crypto.randomUUID());
    row.id = rowId;
    const existing = db.prepare(
        `SELECT 1 FROM velora_admin_rows WHERE table_name = ? AND row_id = ?`
    ).get(table, rowId);
    if (existing || (conflict && merge)) {
        const targetId = String((conflict && conflict.id) || rowId);
        row.id = targetId;
        db.prepare(`
            UPDATE velora_admin_rows
            SET data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE table_name = ? AND row_id = ?
        `).run(JSON.stringify(row), table, targetId);
    } else {
        db.prepare(`
            INSERT INTO velora_admin_rows (table_name, row_id, data)
            VALUES (?, ?, ?)
        `).run(table, rowId, JSON.stringify(row));
    }
    return row;
}

router.use(express.json({ limit: '10mb' }));

router.get('/admin/resolved-packages', (req, res) => {
    try {
        const rows = getCountryPackageCache().packages;
        res.set('Cache-Control', 'no-store');
        res.set('X-Velora-Country-Package-Cache', 'vps-local-derived');
        return res.json(rows);
    } catch (error) {
        console.error('[Velora data] Resolved packages failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/admin/package-live-channels', (req, res) => {
    try {
        const countryId = String(req.query.countryId || '').trim();
        const packageId = String(req.query.packageId || '').trim();
        const cached = getCountryPackageCache();
        const packages = cached.packages;
        const packageById = new Map(packages.map(row => [String(row.id), row]));
        const packageRow = packageById.get(packageId);
        if (!countryId || !packageId) return res.status(400).json({ error: 'countryId and packageId are required' });
        const isParent = packageRow
            && String(packageRow.country_id || '') === countryId
            && packageRow.kind === 'live'
            && (packageRow.is_parent === true || packageRow.is_parent === 'true');
        if (!isParent && !isEditableLivePackage(packageRow, countryId)) {
            return res.status(400).json({ error: 'This package is not an editable live package in this country' });
        }
        const childIds = isParent
            ? (Array.isArray(packageRow.child_package_ids) ? packageRow.child_package_ids : []).map(String)
            : [packageId];
        const allowedPackageIds = new Set(childIds.filter(childId => {
            const child = packageById.get(childId);
            return isEditableLivePackage(child, countryId);
        }));
        let channels = liveChannelsForCurations(
            expandMemberships(cached.memberships).filter(row =>
                String(row.country_id || '') === countryId
                && allowedPackageIds.has(String(row.target_package_id || ''))
            ),
            packageById
        );
        if (isParent) {
            const childPosition = new Map(childIds.map((childId, index) => [childId, index]));
            const seen = new Set();
            channels = channels.filter(channel => {
                const key = `${channel.source_id}:${channel.stream_id}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).sort((left, right) => {
                const packageOrder = (childPosition.get(String(left.package_id)) ?? Number.MAX_SAFE_INTEGER)
                    - (childPosition.get(String(right.package_id)) ?? Number.MAX_SAFE_INTEGER);
                if (packageOrder) return packageOrder;
                const a = Number.isFinite(left.provider_order) ? left.provider_order : Number.MAX_SAFE_INTEGER;
                const b = Number.isFinite(right.provider_order) ? right.provider_order : Number.MAX_SAFE_INTEGER;
                return a - b || String(left.name).localeCompare(String(right.name), 'fr');
            });
        }
        res.set('Cache-Control', 'no-store');
        res.set('X-Velora-Country-Package-Cache', 'vps-local-derived');
        return res.json({ package: packageRow, channels });
    } catch (error) {
        console.error('[Velora data] Package live channels failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/admin/country-live-channel-pool', (req, res) => {
    try {
        const countryId = String(req.query.countryId || '').trim();
        const excludePackageId = String(req.query.excludePackageId || '').trim();
        if (!countryId) return res.status(400).json({ error: 'countryId is required' });
        const packages = resolvedAdminPackages(
            allRows('admin_packages'),
            allRows('admin_stream_curations')
        );
        const packageById = new Map(packages.map(row => [String(row.id), row]));
        const packageIds = new Set(packages
            .filter(row => isEditableLivePackage(row, countryId) && String(row.id) !== excludePackageId)
            .map(row => String(row.id)));
        const channels = liveChannelsForCurations(
            effectiveCurations(packageIds).filter(row =>
                String(row.country_id || '') === countryId
                && packageIds.has(String(row.target_package_id || ''))
            ),
            packageById
        );
        res.set('Cache-Control', 'no-store');
        return res.json({ channels });
    } catch (error) {
        console.error('[Velora data] Country live channel pool failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/admin/package-media-items', (req, res) => {
    try {
        const countryId = String(req.query.countryId || '').trim();
        const packageId = String(req.query.packageId || '').trim();
        const requestedKind = String(req.query.kind || '').trim();
        const kind = requestedKind === 'movies' ? 'vod' : requestedKind;
        if (!countryId || !packageId || !['vod', 'series'].includes(kind)) {
            return res.status(400).json({ error: 'countryId, packageId and a valid media kind are required' });
        }
        const cached = getCountryPackageCache();
        const packages = cached.packages;
        const packageById = new Map(packages.map(row => [String(row.id), row]));
        const packageRow = packageById.get(packageId);
        const isParent = packageRow
            && String(packageRow.country_id || '') === countryId
            && packageRow.kind === kind
            && (packageRow.is_parent === true || packageRow.is_parent === 'true');
        if (!isParent && !isEditableMediaPackage(packageRow, countryId, kind)) {
            return res.status(400).json({ error: 'This package is not an editable media package in this country' });
        }
        const childIds = isParent
            ? (Array.isArray(packageRow.child_package_ids) ? packageRow.child_package_ids : []).map(String)
            : [packageId];
        const allowedPackageIds = new Set(childIds.filter(childId =>
            isEditableMediaPackage(packageById.get(childId), countryId, kind)
        ));
        let items = mediaItemsForCurations(
            expandMemberships(cached.memberships).filter(row =>
                String(row.country_id || '') === countryId
                && allowedPackageIds.has(String(row.target_package_id || ''))
            ),
            packageById,
            kind
        );
        if (isParent) {
            const childPosition = new Map(childIds.map((childId, index) => [childId, index]));
            const seen = new Set();
            items = items.filter(item => {
                const key = `${item.source_id}:${item.stream_id}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).sort((left, right) => {
                const packageOrder = (childPosition.get(String(left.package_id)) ?? Number.MAX_SAFE_INTEGER)
                    - (childPosition.get(String(right.package_id)) ?? Number.MAX_SAFE_INTEGER);
                if (packageOrder) return packageOrder;
                const a = Number.isFinite(left.provider_order) ? left.provider_order : Number.MAX_SAFE_INTEGER;
                const b = Number.isFinite(right.provider_order) ? right.provider_order : Number.MAX_SAFE_INTEGER;
                return a - b || String(left.name).localeCompare(String(right.name), 'fr');
            });
        }
        res.set('Cache-Control', 'no-store');
        res.set('X-Velora-Country-Package-Cache', 'vps-local-derived');
        return res.json({ package: packageRow, items });
    } catch (error) {
        console.error('[Velora data] Package media items failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/admin/package-media-counts', (req, res) => {
    try {
        const countryId = String(req.query.countryId || '').trim();
        const requestedKind = String(req.query.kind || '').trim();
        const kind = requestedKind === 'movies' ? 'vod' : requestedKind;
        if (!countryId || !['vod', 'series'].includes(kind)) {
            return res.status(400).json({ error: 'countryId and a valid media kind are required' });
        }

        const cached = getCountryPackageCache();
        const packages = cached.packages.filter(packageRow =>
            String(packageRow.country_id || '') === countryId
            && packageRow.kind === kind
        );
        const itemKeysByPackage = new Map(packages
            .filter(packageRow => packageRow.is_parent !== true && packageRow.is_parent !== 'true')
            .map(packageRow => [String(packageRow.id), new Set()]));

        for (const membership of expandMemberships(cached.memberships)) {
            if (String(membership.country_id || '') !== countryId || membership.kind !== kind) continue;
            const packageItems = itemKeysByPackage.get(String(membership.target_package_id || ''));
            if (!packageItems) continue;
            packageItems.add(`${String(membership.source_id ?? '')}:${String(membership.stream_id ?? '')}`);
        }

        const counts = packages.map(packageRow => {
            const packageId = String(packageRow.id);
            const isParent = packageRow.is_parent === true || packageRow.is_parent === 'true';
            if (!isParent) {
                return { package_id: packageId, count: itemKeysByPackage.get(packageId)?.size || 0 };
            }
            const uniqueItems = new Set();
            for (const childId of Array.isArray(packageRow.child_package_ids)
                ? packageRow.child_package_ids.map(String)
                : []) {
                for (const itemKey of itemKeysByPackage.get(childId) || []) uniqueItems.add(itemKey);
            }
            return { package_id: packageId, count: uniqueItems.size };
        });

        res.set('Cache-Control', 'no-store');
        res.set('X-Velora-Country-Package-Cache', 'vps-local-derived');
        return res.json({ country_id: countryId, kind, counts });
    } catch (error) {
        console.error('[Velora data] Package media counts failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.post('/admin/memberships/bulk', (req, res) => {
    try {
        const countryId = String(req.body?.countryId || '').trim();
        const requestedKind = String(req.body?.kind || '').trim();
        const kind = requestedKind === 'movies' ? 'vod' : requestedKind;
        const targetPackageId = String(req.body?.targetPackageId || '').trim() || 'hidden';
        const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
        if (!countryId || !['live', 'vod', 'series'].includes(kind) || !requestedItems.length) {
            return res.status(400).json({ error: 'Invalid bulk membership request' });
        }
        if (requestedItems.length > 5000) {
            return res.status(413).json({ error: 'A bulk transfer is limited to 5000 items' });
        }

        const rawCurations = allRows('admin_stream_curations');
        const packages = resolvedAdminPackages(allRows('admin_packages'), rawCurations);
        const packageById = new Map(packages.map(row => [String(row.id), row]));
        const isEditablePackage = packageRow => kind === 'live'
            ? isEditableLivePackage(packageRow, countryId)
            : isEditableMediaPackage(packageRow, countryId, kind);
        if (targetPackageId !== 'hidden' && !isEditablePackage(packageById.get(targetPackageId))) {
            return res.status(400).json({ error: 'The destination package must belong to the same country and media type' });
        }

        const items = [];
        const seenItems = new Set();
        for (let index = 0; index < requestedItems.length; index += 1) {
            const input = requestedItems[index] || {};
            const sourceId = Number.parseInt(input.sourceId, 10);
            const streamId = String(input.streamId || '').trim();
            const fromPackageId = String(input.fromPackageId || '').trim();
            if (!Number.isInteger(sourceId) || !streamId || !fromPackageId) {
                return res.status(400).json({ error: `Invalid membership item at index ${index}` });
            }
            if (!isEditablePackage(packageById.get(fromPackageId))) {
                return res.status(400).json({ error: `Invalid source package at index ${index}` });
            }
            const identity = `${sourceId}\u001f${streamId}`;
            if (seenItems.has(identity)) continue;
            seenItems.add(identity);
            items.push({ sourceId, streamId, fromPackageId });
        }

        const sourcePackageIds = new Set(items.map(item => item.fromPackageId));
        const currentMemberships = new Map(effectiveCurations(sourcePackageIds)
            .filter(row => String(row.country_id || '') === countryId && row.kind === kind)
            .map(row => [
                `${String(row.target_package_id || '')}\u001f${Number.parseInt(row.source_id, 10)}\u001f${String(row.stream_id || '')}`,
                row
            ]));
        const itemType = catalogueItemType(kind);
        const findCatalogueItem = getDb().prepare(`
            SELECT 1 FROM playlist_items
            WHERE source_id = ? AND type = ? AND item_id = ? AND is_hidden = 0
        `);
        const updates = [];
        for (const item of items) {
            const membershipKey = `${item.fromPackageId}\u001f${item.sourceId}\u001f${item.streamId}`;
            const currentMembership = currentMemberships.get(membershipKey);
            if (!currentMembership) {
                return res.status(409).json({ error: `Item ${item.streamId} is no longer in its source package` });
            }
            if (!findCatalogueItem.get(item.sourceId, itemType, item.streamId)) {
                return res.status(404).json({ error: `Item ${item.streamId} was not found in the catalogue` });
            }
            const originalPackageId = String(currentMembership.origin_package_id || item.fromPackageId);
            updates.push({
                countryId,
                sourceId: item.sourceId,
                streamId: item.streamId,
                targetPackageId,
                originPackageId: targetPackageId === originalPackageId ? '' : originalPackageId,
                kind
            });
        }

        const rows = saveMediaCurations(updates, packages, rawCurations);
        invalidateCountryPackageCache();
        res.set('Cache-Control', 'no-store');
        return res.json({ ok: true, count: rows.length, requestedCount: requestedItems.length, curations: rows });
    } catch (error) {
        console.error('[Velora data] Bulk membership update failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.post('/admin/channel-membership', (req, res) => {
    try {
        const countryId = String(req.body?.countryId || '').trim();
        const sourceId = Number.parseInt(req.body?.sourceId, 10);
        const streamId = String(req.body?.streamId || '').trim();
        const fromPackageId = String(req.body?.fromPackageId || '').trim();
        const requestedTargetId = String(req.body?.targetPackageId || '').trim();
        if (!countryId || !Number.isInteger(sourceId) || !streamId || !fromPackageId) {
            return res.status(400).json({ error: 'Invalid channel membership request' });
        }
        const rawCurations = allRows('admin_stream_curations');
        const packages = resolvedAdminPackages(allRows('admin_packages'), rawCurations);
        const packageById = new Map(packages.map(row => [String(row.id), row]));
        const fromPackage = packageById.get(fromPackageId);
        if (!isEditableLivePackage(fromPackage, countryId)) {
            return res.status(400).json({ error: 'Invalid source package' });
        }
        const targetPackageId = requestedTargetId || 'hidden';
        if (targetPackageId !== 'hidden'
            && !isEditableLivePackage(packageById.get(targetPackageId), countryId)) {
            return res.status(400).json({ error: 'The destination package must belong to the same country' });
        }
        const currentMembership = effectiveCurations(new Set([fromPackageId])).find(row =>
            String(row.country_id || '') === countryId
            && String(row.target_package_id || '') === fromPackageId
            && Number.parseInt(row.source_id, 10) === sourceId
            && String(row.stream_id || '') === streamId
            && row.kind === 'live'
        );
        if (!currentMembership) {
            return res.status(409).json({ error: 'This channel is no longer in the source package' });
        }
        const item = getDb().prepare(`
            SELECT 1 FROM playlist_items
            WHERE source_id = ? AND type = 'live' AND item_id = ? AND is_hidden = 0
        `).get(sourceId, streamId);
        if (!item) return res.status(404).json({ error: 'Channel not found in the catalogue' });
        invalidateCountryPackageCache();
        const originalPackageId = String(currentMembership.origin_package_id || fromPackageId);
        const row = saveChannelCuration(
            {
                countryId,
                sourceId,
                streamId,
                targetPackageId,
                originPackageId: targetPackageId === originalPackageId ? '' : originalPackageId
            },
            packages,
            rawCurations
        );
        res.set('Cache-Control', 'no-store');
        return res.json({ ok: true, curation: row });
    } catch (error) {
        console.error('[Velora data] Channel membership update failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.post('/admin/media-membership', (req, res) => {
    try {
        const countryId = String(req.body?.countryId || '').trim();
        const sourceId = Number.parseInt(req.body?.sourceId, 10);
        const streamId = String(req.body?.streamId || '').trim();
        const fromPackageId = String(req.body?.fromPackageId || '').trim();
        const requestedTargetId = String(req.body?.targetPackageId || '').trim();
        const requestedKind = String(req.body?.kind || '').trim();
        const kind = requestedKind === 'movies' ? 'vod' : requestedKind;
        if (!countryId || !Number.isInteger(sourceId) || !streamId || !fromPackageId
            || !['vod', 'series'].includes(kind)) {
            return res.status(400).json({ error: 'Invalid media membership request' });
        }
        const rawCurations = allRows('admin_stream_curations');
        const packages = resolvedAdminPackages(allRows('admin_packages'), rawCurations);
        const packageById = new Map(packages.map(row => [String(row.id), row]));
        const fromPackage = packageById.get(fromPackageId);
        if (!isEditableMediaPackage(fromPackage, countryId, kind)) {
            return res.status(400).json({ error: 'Invalid source package' });
        }
        const targetPackageId = requestedTargetId || 'hidden';
        if (targetPackageId !== 'hidden'
            && !isEditableMediaPackage(packageById.get(targetPackageId), countryId, kind)) {
            return res.status(400).json({ error: 'The destination package must belong to the same country and media type' });
        }
        const currentMembership = effectiveCurations(new Set([fromPackageId])).find(row =>
            String(row.country_id || '') === countryId
            && String(row.target_package_id || '') === fromPackageId
            && Number.parseInt(row.source_id, 10) === sourceId
            && String(row.stream_id || '') === streamId
            && row.kind === kind
        );
        if (!currentMembership) {
            return res.status(409).json({ error: 'This item is no longer in the source package' });
        }
        const itemType = catalogueItemType(kind);
        const item = getDb().prepare(`
            SELECT 1 FROM playlist_items
            WHERE source_id = ? AND type = ? AND item_id = ? AND is_hidden = 0
        `).get(sourceId, itemType, streamId);
        if (!item) return res.status(404).json({ error: 'Media item not found in the catalogue' });
        invalidateCountryPackageCache();
        const originalPackageId = String(currentMembership.origin_package_id || fromPackageId);
        const row = saveMediaCuration(
            {
                countryId,
                sourceId,
                streamId,
                targetPackageId,
                originPackageId: targetPackageId === originalPackageId ? '' : originalPackageId,
                kind
            },
            packages,
            rawCurations
        );
        res.set('Cache-Control', 'no-store');
        return res.json({ ok: true, curation: row });
    } catch (error) {
        console.error('[Velora data] Media membership update failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/admin/stream-curation-map', (req, res) => {
    try {
        const cached = getCountryPackageCache().memberships;
        const compactRows = cached.rows.map(row => {
            const streamId = Number(row[1]);
            return Number.isFinite(streamId) ? [row[0], streamId, row[2], row[3], row[4]] : null;
        }).filter(Boolean);
        res.set('Cache-Control', 'no-store');
        res.set('X-Velora-Country-Package-Cache', 'vps-local-derived');
        return res.json({ countries: cached.countries, packages: cached.packages, rows: compactRows });
    } catch (error) {
        console.error('[Velora data] Curation map failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/country-package-cache', (req, res) => {
    try {
        const payload = getCountryPackageCache();
        res.set('Cache-Control', 'private, no-cache');
        res.set('X-Velora-Country-Package-Cache', 'vps-local-derived');
        return res.json(payload);
    } catch (error) {
        console.error('[Velora data] Country/package cache failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/hidden-filters', (req, res) => {
    try {
        const { prefixes, hiddenFilters } = homeChannelNameRules();
        res.set('Cache-Control', 'private, no-cache');
        return res.json({ filters: hiddenFilters, prefixes });
    } catch (error) {
        console.error('[Velora data] Hidden filters endpoint failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/channel-rules', (req, res) => {
    try {
        const { prefixes, hiddenFilters } = homeChannelNameRules();
        res.set('Cache-Control', 'private, no-cache');
        return res.json({ prefixes, hiddenFilters });
    } catch (error) {
        console.error('[Velora data] Channel rules endpoint failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

function buildMediaFeedCache() {
    const countryPackageCache = getCountryPackageCache();
    const resolvedPackages = countryPackageCache.packages;
    const curations = expandMemberships(countryPackageCache.memberships);

    const packageStreams = new Map();
    const packageStreamCounts = new Map();

    for (const row of curations) {
        const countryId = String(row.country_id || '').trim();
        const packageId = String(row.target_package_id || '').trim();
        const streamId = String(row.stream_id || '').trim();
        const kind = String(row.kind || '').trim();
        if (!countryId || !packageId || !streamId || (kind !== 'vod' && kind !== 'series')) continue;

        const key = `${countryId}:${packageId}`;
        if (!packageStreams.has(key)) {
            packageStreams.set(key, { keys: new Set(), sourceAware: false });
        }
        const membership = packageStreams.get(key);
        const sourceId = String(row.source_id || '').trim();
        if (sourceId) {
            membership.sourceAware = true;
            membership.keys.add(`${sourceId}:${streamId}`);
        } else {
            membership.keys.add(streamId);
        }
        packageStreamCounts.set(key, (packageStreamCounts.get(key) || 0) + 1);
    }

    const snapshots = {
        movies: veloraCatalogCache.getSnapshot('vod_streams') || [],
        series: veloraCatalogCache.getSnapshot('series') || []
    };

    let posterCache = {};
    try { posterCache = JSON.parse(fs.readFileSync(vodPosterCachePath, 'utf8')) || {}; } catch (_) {}
    let backdropCache = {};
    try { backdropCache = JSON.parse(fs.readFileSync(vodBackdropCachePath, 'utf8')) || {}; } catch (_) {}

    const snapshotIndexes = {
        movies: new Map(),
        series: new Map()
    };
    for (const kind of ['movies', 'series']) {
        const list = snapshots[kind];
        const idx = snapshotIndexes[kind];
        for (const item of list) {
            const rawId = String(item.raw_stream_id ?? item.raw_series_id ?? item.stream_id ?? item.series_id ?? '');
            const sourceId = String(item.source_id ?? item.nodecast_source_id ?? '').trim();
            if (rawId) {
                if (sourceId) idx.set(`${sourceId}:${rawId}`, item);
                if (!idx.has(rawId)) idx.set(rawId, item);
            }
        }
    }

    const countries = allRows('admin_countries');
    const orderRows = allRows('admin_country_package_order');

    const feedByCountry = {};
    let totalCachedItems = 0;
    let totalCachedPackages = 0;

    for (const country of countries) {
        const countryId = String(country.id);
        feedByCountry[countryId] = {
            countryId,
            countryName: country.name,
            movies: [],
            series: []
        };

        for (const tab of ['movies', 'series']) {
            const kind = tab === 'movies' ? 'vod' : 'series';
            const countryPackages = resolvedPackages.filter(p => 
                String(p.country_id) === countryId && (p.kind === kind || (kind === 'vod' && p.kind === 'movies'))
                && p.is_hidden !== true && p.is_hidden !== 'true'
            );

            const orderRow = orderRows.find(r => String(r.country_id) === countryId && (r.ui_tab === tab || (tab === 'movies' && r.ui_tab === 'vod')));
            const orderList = Array.isArray(orderRow?.package_order) ? orderRow.package_order.map(String) : [];
            const posMap = new Map(orderList.map((id, index) => [id, index]));

            countryPackages.sort((a, b) => {
                const posA = posMap.has(String(a.id)) ? posMap.get(String(a.id)) : 999999;
                const posB = posMap.has(String(b.id)) ? posMap.get(String(b.id)) : 999999;
                return posA - posB || String(a.name).localeCompare(String(b.name), 'fr');
            });

            const tabFeed = [];

            for (const pkg of countryPackages) {
                const pkgId = String(pkg.id);
                const memKey = `${countryId}:${pkgId}`;
                const membership = packageStreams.get(memKey) || { keys: new Set(), sourceAware: false };
                const totalCount = packageStreamCounts.get(memKey) || membership.keys.size || 0;

                const providerSourceId = String(pkg.source_id ?? '').trim();
                const providerCategoryId = String(pkg.category_id ?? '').trim();
                const providerBacked = Boolean(providerSourceId && providerCategoryId);

                const items = [];
                const snapshotList = snapshots[tab];
                const snapshotIdx = snapshotIndexes[tab];

                if (membership.keys.size > 0) {
                    for (const key of membership.keys) {
                        const item = snapshotIdx.get(key);
                        if (!item) continue;
                        const rawId = item.raw_stream_id ?? item.raw_series_id ?? item.stream_id ?? item.series_id;
                        const rawName = String(item.name || item.title || item.series_name || '').trim();
                        const sourceId = String(item.source_id ?? item.nodecast_source_id ?? '').trim();
                        const itemKey = `${sourceId}:${String(rawId)}`;
                        const titleKey = normalizedPosterTitle(rawName);

                        let posterUrl = '';
                        let posterCandidate = item.stream_icon ?? item.cover ?? item.cover_big ?? item.movie_image ?? item.series_image ?? item.poster_path ?? item.poster ?? '';
                        if (Array.isArray(posterCandidate) && posterCandidate.length > 0) posterCandidate = posterCandidate[0];
                        if (typeof posterCandidate === 'string' && posterCandidate.trim()) {
                            let url = posterCandidate.trim();
                            if (url.startsWith('/')) url = `https://image.tmdb.org/t/p/w500${url}`;
                            if (!url.includes('/w1280/') && !url.includes('/backdrop')) {
                                posterUrl = url;
                            }
                        }
                        if (!posterUrl) {
                            posterUrl = posterCache[itemKey] || posterCache[titleKey] || '';
                        }

                        let backdropUrl = '';
                        let backdropCandidate = item.backdrop_path ?? item.backdrop ?? item.backdrop_url ?? '';
                        if (Array.isArray(backdropCandidate) && backdropCandidate.length > 0) backdropCandidate = backdropCandidate[0];
                        if (typeof backdropCandidate === 'string' && backdropCandidate.trim()) {
                            let url = backdropCandidate.trim();
                            if (url.startsWith('/')) url = `https://image.tmdb.org/t/p/w780${url}`;
                            backdropUrl = url;
                        }
                        if (!backdropUrl) {
                            backdropUrl = backdropCache[itemKey] || backdropCache[titleKey] || '';
                        }

                        const finalPoster = posterUrl || backdropUrl;
                        const finalBackdrop = backdropUrl || posterUrl;

                        items.push({
                            id: `feed:${pkgId}:${rawId}`,
                            name: rawName,
                            thumbUrl: finalPoster,
                            posterUrl: finalPoster,
                            backdropUrl: finalBackdrop,
                            rating: item.rating || item.rating_5based || item.score || '',
                            year: item.year || item.releaseDate || '',
                            plot: item.plot || item.description || item.overview || '',
                            streamId: rawId,
                            sourceId: sourceId || pkg.source_id,
                            globalStreamId: item.global_stream_id || item.nodecast_global_stream_id || rawId,
                            containerExtension: item.container_extension || '',
                            contentType: tab,
                            packageId: pkgId
                        });
                        if (items.length >= MEDIA_FEED_ENTRIES_PER_PACKAGE) break;
                    }
                } else if (providerBacked) {
                    for (const item of snapshotList) {
                        const sourceId = String(item.source_id ?? item.nodecast_source_id ?? '').trim();
                        if (sourceId === providerSourceId && String(item.raw_category_id ?? '') === providerCategoryId) {
                            const rawId = item.raw_stream_id ?? item.raw_series_id ?? item.stream_id ?? item.series_id;
                            const rawName = String(item.name || item.title || item.series_name || '').trim();
                            const itemKey = `${sourceId}:${String(rawId)}`;
                            const titleKey = normalizedPosterTitle(rawName);

                            let posterUrl = '';
                            let posterCandidate = item.stream_icon ?? item.cover ?? item.cover_big ?? item.movie_image ?? item.series_image ?? item.poster_path ?? item.poster ?? '';
                            if (Array.isArray(posterCandidate) && posterCandidate.length > 0) posterCandidate = posterCandidate[0];
                            if (typeof posterCandidate === 'string' && posterCandidate.trim()) {
                                let url = posterCandidate.trim();
                                if (url.startsWith('/')) url = `https://image.tmdb.org/t/p/w500${url}`;
                                if (!url.includes('/w1280/') && !url.includes('/backdrop')) {
                                    posterUrl = url;
                                }
                            }
                            if (!posterUrl) {
                                posterUrl = posterCache[itemKey] || posterCache[titleKey] || '';
                            }

                            let backdropUrl = '';
                            let backdropCandidate = item.backdrop_path ?? item.backdrop ?? item.backdrop_url ?? '';
                            if (Array.isArray(backdropCandidate) && backdropCandidate.length > 0) backdropCandidate = backdropCandidate[0];
                            if (typeof backdropCandidate === 'string' && backdropCandidate.trim()) {
                                let url = backdropCandidate.trim();
                                if (url.startsWith('/')) url = `https://image.tmdb.org/t/p/w780${url}`;
                                backdropUrl = url;
                            }
                            if (!backdropUrl) {
                                backdropUrl = backdropCache[itemKey] || backdropCache[titleKey] || '';
                            }

                            const finalPoster = posterUrl || backdropUrl;
                            const finalBackdrop = backdropUrl || posterUrl;

                            items.push({
                                id: `feed:${pkgId}:${rawId}`,
                                name: rawName,
                                thumbUrl: finalPoster,
                                posterUrl: finalPoster,
                                backdropUrl: finalBackdrop,
                                rating: item.rating || item.rating_5based || item.score || '',
                                year: item.year || item.releaseDate || '',
                                plot: item.plot || item.description || item.overview || '',
                                streamId: rawId,
                                sourceId: sourceId || pkg.source_id,
                                globalStreamId: item.global_stream_id || item.nodecast_global_stream_id || rawId,
                                containerExtension: item.container_extension || '',
                                contentType: tab,
                                packageId: pkgId
                            });
                            if (items.length >= MEDIA_FEED_ENTRIES_PER_PACKAGE) break;
                        }
                    }
                }

                totalCachedItems += items.length;
                totalCachedPackages += 1;

                tabFeed.push({
                    id: pkgId,
                    name: pkg.name,
                    kind: pkg.kind,
                    countryId: pkg.country_id,
                    sourceId: pkg.source_id,
                    categoryId: pkg.category_id,
                    totalCount: Math.max(totalCount, items.length),
                    items
                });
            }

            feedByCountry[countryId][tab] = tabFeed;
        }
    }

    const payload = {
        version: 3,
        generatedAt: new Date().toISOString(),
        totalPackages: totalCachedPackages,
        totalItems: totalCachedItems,
        feed: feedByCountry
    };

    try {
        fs.mkdirSync(path.dirname(mediaFeedCachePath), { recursive: true });
        fs.writeFileSync(mediaFeedCachePath, JSON.stringify(payload));
    } catch (e) {
        console.warn('[Velora data] Could not save media feed cache:', e.message);
    }

    currentMediaFeedCache = payload;
    return payload;
}

function getMediaFeedCache() {
    if (currentMediaFeedCache && currentMediaFeedCache.version >= 3) return currentMediaFeedCache;
    try {
        if (fs.existsSync(mediaFeedCachePath)) {
            const raw = JSON.parse(fs.readFileSync(mediaFeedCachePath, 'utf8'));
            if (raw && raw.feed && raw.version >= 3) {
                currentMediaFeedCache = raw;
                return currentMediaFeedCache;
            }
        }
    } catch (_) {}
    return buildMediaFeedCache();
}

router.get('/country-media-feed', (req, res) => {
    try {
        const countryId = String(req.query.country_id || req.query.countryId || 'country_france').trim();
        const tab = String(req.query.tab || 'movies').trim().toLowerCase();
        const fullFeed = getMediaFeedCache();
        const countryData = fullFeed.feed?.[countryId] || fullFeed.feed?.['country_france'] || fullFeed.feed?.['default'] || { movies: [], series: [] };
        const packages = countryData[tab] || [];
        res.set('Cache-Control', 'public, max-age=60');
        res.set('X-Velora-Media-Feed-Cache', 'vps-local-derived');
        return res.json({
            ok: true,
            countryId,
            tab,
            generatedAt: fullFeed.generatedAt,
            totalFeedPackages: fullFeed.totalPackages || packages.length,
            packages
        });
    } catch (error) {
        console.error('[Velora data] Media feed route failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.post('/admin/rebuild-media-feed', (req, res) => {
    try {
        invalidateMediaFeedCache();
        const payload = buildMediaFeedCache();
        return res.json({
            ok: true,
            generatedAt: payload.generatedAt,
            totalPackages: payload.totalPackages,
            totalItems: payload.totalItems
        });
    } catch (error) {
        console.error('[Velora data] Rebuild media feed failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

// Nightly automatic feed cache rebuild (every 24 hours) & on snapshot ready
try {
    veloraCatalogCache.onSnapshotReady(() => {
        try {
            buildMediaFeedCache();
            console.log('[Velora cache] Media feed cache auto-refreshed on snapshot update.');
        } catch (e) {
            console.warn('[Velora cache] Media feed post-build hook error:', e.message);
        }
    });
} catch (_) {}

setInterval(() => {
    try {
        buildMediaFeedCache();
        console.log('[Velora cache] Nightly media feed cache rebuild completed.');
    } catch (e) {
        console.warn('[Velora cache] Nightly rebuild failed:', e.message);
    }
}, 24 * 60 * 60 * 1000).unref?.();

function buildHomeCache() {
    const sections = sortRows(allRows('admin_home_sections'), 'section_order.asc');
    const channelRules = homeChannelNameRules();
    const sectionPackageIds = new Set(sections.map(section => String(section.package_id || '')));
    const countryPackageCache = getCountryPackageCache();
    const curations = expandMemberships(countryPackageCache.memberships)
        .filter(row => sectionPackageIds.has(String(row.target_package_id || '')));
    const resolvedPackages = countryPackageCache.packages;
    const packages = new Map(resolvedPackages.map(row => [String(row.id), row]));
    const packageStreams = new Map();
    for (const row of curations) {
        const packageId = String(row.target_package_id || '').trim();
        const streamId = String(row.stream_id || '').trim();
        if (!packageId || !streamId) continue;
        const packageRow = packages.get(packageId) || {};
        const sourceId = String(row.source_id ?? packageRow.source_id ?? '').trim();
        const kind = String(row.kind ?? packageRow.kind ?? '').trim();
        if (!packageStreams.has(packageId)) {
            packageStreams.set(packageId, { keys: new Set(), sourceAware: false });
        }
        const membership = packageStreams.get(packageId);
        if ((kind === 'vod' || kind === 'series') && sourceId) {
            membership.sourceAware = true;
            membership.keys.add(`${sourceId}:${streamId}`);
        } else {
            membership.keys.add(streamId);
        }
    }
    const snapshots = {
        live: veloraCatalogCache.getSnapshot('live_streams') || [],
        movies: veloraCatalogCache.getSnapshot('vod_streams') || [],
        series: veloraCatalogCache.getSnapshot('series') || []
    };
    let backdropCache = {};
    try { backdropCache = JSON.parse(fs.readFileSync(vodBackdropCachePath, 'utf8')) || {}; } catch (_) {}

    const output = sections.map(section => {
        const type = ['live', 'movies', 'series'].includes(section.content_type)
            ? section.content_type : 'live';
        const packageRow = packages.get(String(section.package_id)) || {};
        const providerSourceId = String(packageRow.source_id ?? '').trim();
        const providerCategoryId = String(packageRow.category_id ?? '').trim();
        const providerKind = String(packageRow.kind ?? '').trim();
        const expectedKind = type === 'movies' ? 'vod' : type;
        const providerBacked = Boolean(providerSourceId && providerCategoryId && (!providerKind || providerKind === expectedKind));
        const membership = packageStreams.get(String(section.package_id)) || { keys: new Set(), sourceAware: false };
        const orientation = String(section.card_orientation || 'vertical').toLowerCase() === 'horizontal' ? 'horizontal' : 'vertical';
        const isHorizontal = orientation === 'horizontal';
        let entries = [];
        if (Array.isArray(section.custom_entries) && section.custom_entries.length > 0) {
            entries = section.custom_entries.map((item, a) => {
                const rawName = String(item.name || item.title || '').trim();
                const rawId = item.streamId ?? item.stream_id ?? item.raw_stream_id ?? a;
                const standardThumb = String(item.thumbUrl || item.stream_icon || item.cover || '');
                const backdropUrl = String(item.backdropUrl || item.backdrop || standardThumb || '');
                const finalThumb = (isHorizontal && backdropUrl) ? backdropUrl : (standardThumb || backdropUrl);
                return {
                    id: item.id || `home-cache:${section.id}:${rawId}`,
                    name: stripHomeChannelPrefixes(rawName, channelRules.prefixes, channelRules.suffixes),
                    thumbUrl: finalThumb,
                    backdropUrl: backdropUrl || (isHorizontal ? '' : standardThumb),
                    section_logo_url: String(section.logo_url || section.badge_logo_url || item.section_logo_url || '').trim(),
                    streamId: rawId,
                    sourceId: item.sourceId ?? item.source_id,
                    globalStreamId: item.globalStreamId ?? item.global_stream_id ?? rawId,
                    containerExtension: item.containerExtension ?? item.container_extension ?? '',
                    contentType: type,
                    packageId: section.package_id
                };
            }).filter(item => item?.name).slice(0, HOME_CACHE_ENTRIES_PER_PACKAGE);
        } else {
            entries = snapshots[type].filter(item => {
                const rawId = item.raw_stream_id ?? item.raw_series_id ?? item.stream_id ?? item.series_id;
                const sourceId = String(item.source_id ?? item.nodecast_source_id ?? '').trim();
                if (membership.keys.size) {
                    return membership.sourceAware
                        ? membership.keys.has(`${sourceId}:${String(rawId)}`)
                        : membership.keys.has(String(rawId));
                }
                if (providerBacked) {
                    return sourceId === providerSourceId
                        && String(item.raw_category_id ?? '') === providerCategoryId;
                }
                return false;
            }).map(item => {
                const rawId = item.raw_stream_id ?? item.raw_series_id ?? item.stream_id ?? item.series_id;
                const rawName = String(item.name || item.title || item.series_name || '').trim();
                if (type === 'live' && isHomeChannelHidden(rawName, channelRules.hiddenFilters)) return null;
                const sourceId = String(item.source_id ?? item.nodecast_source_id ?? '').trim();
                const key = `${sourceId}:${String(rawId)}`;
                const titleKey = normalizedPosterTitle(rawName);

                let backdropCandidate = item.backdrop_path ?? item.backdrop ?? item.backdrop_url ?? '';
                if (Array.isArray(backdropCandidate) && backdropCandidate.length > 0) backdropCandidate = backdropCandidate[0];
                let backdropUrl = '';
                if (typeof backdropCandidate === 'string' && backdropCandidate.trim()) {
                    let url = backdropCandidate.trim();
                    if (url.startsWith('/')) url = `https://image.tmdb.org/t/p/w1280${url}`;
                    backdropUrl = url;
                }
                if (!backdropUrl && isHorizontal) {
                    backdropUrl = backdropCache[key] || backdropCache[titleKey] || '';
                }
                const standardThumb = String(item.stream_icon || item.cover || '');
                const finalThumb = (isHorizontal && backdropUrl) ? backdropUrl : (standardThumb || backdropUrl);
                return {
                    id: `home-cache:${section.id}:${rawId}`,
                    name: stripHomeChannelPrefixes(rawName, channelRules.prefixes, channelRules.suffixes),
                    thumbUrl: finalThumb,
                    backdropUrl: backdropUrl || (isHorizontal ? '' : standardThumb),
                    section_logo_url: String(section.logo_url || section.badge_logo_url || '').trim(),
                    streamId: rawId,
                    sourceId: item.source_id,
                    globalStreamId: item.global_stream_id || item.stream_id,
                    containerExtension: item.container_extension || '',
                    contentType: type,
                    packageId: section.package_id
                };
            }).filter(item => item?.name).slice(0, HOME_CACHE_ENTRIES_PER_PACKAGE);
        }
        return { ...section, country_ids: Array.isArray(section.country_ids) ? section.country_ids : (section.country_id ? String(section.country_id).split(',').map(s => s.trim()).filter(Boolean) : ['default']), content_type: type, card_orientation: orientation, logo_url: String(section.logo_url || section.badge_logo_url || '').trim(), entries };
    });
    const payload = { generatedAt: new Date().toISOString(), sections: output };
    writeJsonAtomic(homeCachePath, payload);
    return payload;
}

router.get('/home-cache', (req, res) => {
    try {
        const payload = fs.existsSync(homeCachePath)
            ? JSON.parse(fs.readFileSync(homeCachePath, 'utf8'))
            : buildHomeCache();
        const countryId = String(req.query.country_id || '').trim();
        const sectionId = String(req.query.section_id || '').trim();
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 100);
        const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
        let sections = Array.isArray(payload.sections) ? payload.sections : [];
        if (countryId) {
            const countrySections = sections.filter(section => {
                if (section.published === false) return false;
                const ids = Array.isArray(section.country_ids) && section.country_ids.length
                    ? section.country_ids
                    : String(section.country_id || '').split(',').map(s => s.trim()).filter(Boolean);
                return ids.includes(countryId);
            });
            sections = countrySections.length ? countrySections : sections.filter(section => {
                if (section.published === false) return false;
                const ids = Array.isArray(section.country_ids) && section.country_ids.length
                    ? section.country_ids
                    : String(section.country_id || '').split(',').map(s => s.trim()).filter(Boolean);
                return !ids.length || ids.includes('default') || ids.includes('all');
            });
        }
        if (sectionId) sections = sections.filter(section => String(section.id) === sectionId);
        sections = sections.map(section => {
            const entries = Array.isArray(section.entries) ? section.entries : [];
            return {
                ...section,
                entryCount: entries.length,
                entries: entries.slice(offset, offset + limit)
            };
        });
        res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
        return res.json({ generatedAt: payload.generatedAt, sections });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.get('/media-backdrop', async (req, res) => {
    try {
        const name = String(req.query.name || '').trim();
        const type = String(req.query.type || 'movies').trim();
        const streamId = String(req.query.stream_id || '').trim();
        const sourceId = String(req.query.source_id || '').trim();
        if (!name && !streamId) return res.status(400).json({ error: 'name or stream_id required' });

        let backdropCache = {};
        try { backdropCache = JSON.parse(fs.readFileSync(vodBackdropCachePath, 'utf8')) || {}; } catch (_) {}
        const key = `${sourceId}:${streamId}`;
        const titleKey = normalizedPosterTitle(name);
        if (backdropCache[key]) return res.json({ ok: true, backdropUrl: backdropCache[key] });
        if (backdropCache[titleKey]) return res.json({ ok: true, backdropUrl: backdropCache[titleKey] });

        let sourceRows = [];
        try { sourceRows = await sources.getAll(); } catch (_) {}
        const sourceMap = new Map(sourceRows.map(source => [String(source.id), source]));
        const apiMap = new Map();

        const entry = { name, contentType: type, streamId, sourceId };
        const backdrop = await resolveBackdropForEntry(entry, sourceMap, apiMap, backdropCache);
        if (backdrop) {
            try { fs.writeFileSync(vodBackdropCachePath, JSON.stringify(backdropCache, null, 2)); } catch (_) {}
            return res.json({ ok: true, backdropUrl: backdrop });
        }
        return res.json({ ok: false, backdropUrl: '' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

const SECTION_LOGO_UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'section-logos');
const SECTION_LOGO_PUBLIC_PATH = '/uploads/section-logos';

function detectImageExt(buffer, defaultName) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
    if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'gif';
    if (buffer.length >= 4 && buffer.subarray(0, 64).toString('utf8').toLowerCase().includes('<svg')) return 'svg';
    const lower = String(defaultName || '').toLowerCase();
    if (lower.endsWith('.png')) return 'png';
    if (lower.endsWith('.webp')) return 'webp';
    if (lower.endsWith('.svg')) return 'svg';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
    if (lower.endsWith('.gif')) return 'gif';
    return 'png';
}

router.post('/upload-section-logo', async (req, res) => {
    try {
        const encoded = String(req.body?.dataBase64 || '').trim();
        const rawFileName = String(req.body?.fileName || 'logo').trim();
        if (!encoded) return res.status(400).json({ error: 'Image data required.' });
        const buffer = Buffer.from(encoded.replace(/^data:[^;]+;base64,/, ''), 'base64');
        if (!buffer.length || buffer.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'Image must be 5 MB or smaller.' });
        const ext = detectImageExt(buffer, rawFileName);
        await fs.promises.mkdir(SECTION_LOGO_UPLOAD_DIR, { recursive: true });
        const cleanBase = rawFileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'logo';
        const fileName = `${cleanBase}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
        await fs.promises.writeFile(path.join(SECTION_LOGO_UPLOAD_DIR, fileName), buffer);
        const url = `${SECTION_LOGO_PUBLIC_PATH}/${fileName}`;
        return res.json({ ok: true, url, path: url });
    } catch (err) {
        console.error('[veloraData] upload-section-logo failed:', err);
        return res.status(500).json({ error: err.message });
    }
});

router.post('/home-cache/rebuild', async (req, res) => {
    try {
        if (Array.isArray(req.body?.sections)) {
            let backdropCache = {};
            try { backdropCache = JSON.parse(fs.readFileSync(vodBackdropCachePath, 'utf8')) || {}; } catch (_) {}
            let changed = false;
            for (const sec of req.body.sections) {
                if (sec?.card_orientation === 'horizontal' && Array.isArray(sec.entries)) {
                    for (const entry of sec.entries) {
                        const b = String(entry.backdropUrl || (entry.thumbUrl && entry.thumbUrl.includes('/w1280') ? entry.thumbUrl : '')).trim();
                        if (b) {
                            const key = `${entry.sourceId || ''}:${entry.streamId || ''}`;
                            const titleKey = normalizedPosterTitle(entry.name);
                            if (key && key !== ':') { backdropCache[key] = b; changed = true; }
                            if (titleKey) { backdropCache[titleKey] = b; changed = true; }
                        }
                    }
                }
            }
            if (changed) {
                try { fs.writeFileSync(vodBackdropCachePath, JSON.stringify(backdropCache, null, 2)); } catch (_) {}
            }
        }
        const payload = buildHomeCache();
        await enrichHomeCacheMoviePosters(payload);
        await enrichHomeCacheBackdrops(payload);
        writeJsonAtomic(homeCachePath, payload);
        return res.json({ ok: true, generatedAt: payload.generatedAt, sections: payload.sections.length,
            entries: payload.sections.reduce((total, section) => total + section.entries.length, 0) });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

const HERO_COUNTRY_MATCHERS = [
    { code: 'FR', id: 'country_france', name: 'France', patterns: [/\b(fr|french|france|vf|vostfr)\b/i, /\[FR\]/i, /^FR\s*[-:|]/i] },
    { code: 'US', id: 'country_usa', altId: 'country_etats_unis', name: 'USA / États-Unis', patterns: [/\b(us|usa|english|eng|en)\b/i, /\[US\]|\[EN\]|\[UK\]/i, /^(US|EN|UK)\s*[-:|]/i] },
    { code: 'ES', id: 'country_espagne', name: 'Espagne', patterns: [/\b(es|espagne|spain|spanish|castellano|latino|lat)\b/i, /\[ES\]|\[LAT\]/i, /^(ES|LAT)\s*[-:|]/i] },
    { code: 'DE', id: 'country_allemagne', name: 'Allemagne', patterns: [/\b(de|allemagne|germany|german|deutsch)\b/i, /\[DE\]/i, /^DE\s*[-:|]/i] },
    { code: 'IT', id: 'country_italie', name: 'Italie', patterns: [/\b(it|italie|italy|italian|italiano)\b/i, /\[IT\]/i, /^IT\s*[-:|]/i] },
    { code: 'AR', id: 'country_arabe', altId: 'country_arabie_saoudite', name: 'Arabe', patterns: [/\b(ar|arabe|arabic)\b/i, /\[AR\]/i, /^AR\s*[-:|]/i, /[\u0600-\u06FF]/] },
    { code: 'PT', id: 'country_portugal', altId: 'country_bresil', name: 'Portugal / Brésil', patterns: [/\b(pt|portugal|portuguese|brasil|br|brazil)\b/i, /\[PT\]|\[BR\]/i, /^(PT|BR)\s*[-:|]/i] },
    { code: 'NL', id: 'country_pays_bas', name: 'Pays-Bas', patterns: [/\b(nl|pays-bas|netherlands|dutch|nederlands)\b/i, /\[NL\]/i, /^NL\s*[-:|]/i] },
    { code: 'PL', id: 'country_pologne', name: 'Pologne', patterns: [/\b(pl|pologne|poland|polish|polski)\b/i, /\[PL\]/i, /^PL\s*[-:|]/i] },
    { code: 'TR', id: 'country_turquie', name: 'Turquie', patterns: [/\b(tr|turquie|turkey|turkish|turkce)\b/i, /\[TR\]/i, /^TR\s*[-:|]/i] },
    { code: 'RU', id: 'country_russie', name: 'Russie', patterns: [/\b(ru|russie|russia|russian)\b/i, /\[RU\]/i, /^RU\s*[-:|]/i, /[\u0400-\u04FF]/] },
    { code: 'JP', id: 'country_japon', name: 'Japon', patterns: [/\b(jp|japon|japan|japanese)\b/i, /\[JP\]/i, /^JP\s*[-:|]/i] },
    { code: 'IN', id: 'country_inde', name: 'Inde', patterns: [/\b(in|inde|india|hindi|tamil|telugu)\b/i, /\[IN\]|\[HI\]/i, /^(IN|HI|TG)\s*[-:|]/i] }
];

function matchItemToCountry(catName, itemName) {
    const text = `${catName || ''} ${itemName || ''}`;
    for (const m of HERO_COUNTRY_MATCHERS) {
        if (m.patterns.some(p => p.test(text))) {
            return m;
        }
    }
    return null;
}

function extractYear(text) {
    const m = /\b(19\d{2}|20\d{2})\b/.exec(text);
    return m ? m[1] : '';
}

function cleanItemName(text) {
    return String(text || '')
        .replace(/^(4K-?|UHD-?|FHD-?|HD-?)?([A-Za-z0-9]{1,6}(?:-[A-Za-z0-9]{1,6})?)\s*[-:|]\s*/i, '')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/\b(4K|UHD|FHD|HD|HEVC|H265|1080p|720p|CAM|TS|DVD|BLURAY|TELESYNC|VOSTFR|VF|MULTI)\b/gi, '')
        .replace(/\(\d{4}(?:-\d{2}-\d{2})?\)/g, '')
        .replace(/\(\d{4}\)/g, '')
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
        .replace(/\((?:US|FR|DE|ES|IT|AR|UK|ZA|TR|PL|NL)\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

router.get('/hero-slider', (req, res) => {
    try {
        const countryId = String(req.query.country_id || '').trim();
        const rows = allRows('admin_hero_slider')
            .filter(row => row.published !== false && row.published !== 'false')
            .filter(row => {
                if (!countryId || countryId === 'default' || countryId === 'all') return true;
                if (Array.isArray(row.excluded_countries) && row.excluded_countries.includes(countryId)) return false;
                if (row.country_mappings && row.country_mappings[countryId] && row.country_mappings[countryId].hidden) return false;
                return true;
            })
            .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
        
        const results = rows.map(item => {
            const mappings = (item.country_mappings && typeof item.country_mappings === 'object') ? item.country_mappings : {};
            let selectedStream = null;
            let isFallback = false;
            let resolvedCountryId = countryId;

            if (countryId && mappings[countryId]) {
                selectedStream = mappings[countryId];
            } else if (countryId) {
                // Fallback to USA or International or default
                const usaStream = mappings['country_usa'] || mappings['country_etats_unis'] || mappings['default'] || Object.values(mappings)[0] || null;
                if (usaStream) {
                    selectedStream = usaStream;
                    isFallback = true;
                    resolvedCountryId = usaStream.country_id || 'country_usa';
                }
            } else {
                selectedStream = mappings['country_usa'] || mappings['country_etats_unis'] || mappings['default'] || Object.values(mappings)[0] || null;
            }

            const resolvedLogo = mappings[resolvedCountryId]?.logo || item.country_mappings?.[resolvedCountryId]?.logo || item.logo || item.logo_url || item.title_logo || selectedStream?.logo || '';

            return {
                id: item.id,
                title: item.title || selectedStream?.name || '',
                logo: resolvedLogo,
                category: item.category || selectedStream?.contentType || 'movie',
                badge: item.badge || 'Top Trending',
                image: item.image || selectedStream?.thumbUrl || '',
                backdrop: item.backdrop || item.image || selectedStream?.thumbUrl || '',
                overview: item.overview || '',
                rating: item.rating || selectedStream?.rating || '',
                year: item.year || selectedStream?.year || '',
                sort_order: Number(item.sort_order) || 0,
                published: item.published !== false,
                is_fallback: isFallback,
                resolved_country_id: resolvedCountryId,
                country_mappings: mappings,
                excluded_countries: item.excluded_countries || [],
                stream: selectedStream ? {
                    streamId: selectedStream.streamId || selectedStream.stream_id,
                    sourceId: selectedStream.sourceId || selectedStream.source_id,
                    globalStreamId: selectedStream.globalStreamId || selectedStream.global_stream_id,
                    name: selectedStream.name || item.title,
                    thumbUrl: selectedStream.thumbUrl || item.image,
                    containerExtension: selectedStream.containerExtension || selectedStream.container_extension || '',
                    contentType: selectedStream.contentType || selectedStream.type || item.category || 'movie',
                    packageId: selectedStream.packageId || ''
                } : null
            };
        });

        return res.json(results);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.get('/hero-slider/search-catalog', (req, res) => {
    try {
        const rawQuery = String(req.query.q || '').trim();
        const typeFilter = String(req.query.type || '').trim().toLowerCase();
        if (!rawQuery) return res.json([]);

        const normalized = String(rawQuery)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        let tokens = normalized.split(/\s+/).filter(Boolean);
        if (!tokens.length) tokens = [rawQuery.toLowerCase()];

        const db = getDb();
        const tokenClauses = [];
        const params = [];

        tokens.forEach(t => {
            if (t === 'spiderman') {
                tokenClauses.push(`(p.name LIKE ? OR (p.name LIKE ? AND p.name LIKE ?))`);
                params.push(`%spiderman%`, `%spider%`, `%man%`);
            } else {
                tokenClauses.push(`p.name LIKE ?`);
                params.push(`%${t}%`);
            }
        });

        let typeClause = '';
        if (typeFilter === 'movie' || typeFilter === 'vod') {
            typeClause = ' AND p.type = ?';
            params.push('movie');
        } else if (typeFilter === 'series') {
            typeClause = ' AND p.type = ?';
            params.push('series');
        }

        let rows = [];
        try {
            rows = db.prepare(`
                SELECT p.source_id, p.item_id, p.type, p.name, p.stream_icon, p.container_extension, p.rating, p.year, p.data, c.name as cat_name
                FROM playlist_items p
                LEFT JOIN categories c ON p.source_id = c.source_id AND p.category_id = c.category_id
                WHERE (${tokenClauses.join(' AND ')}) AND p.is_hidden = 0${typeClause}
                LIMIT 500
            `).all(...params);
        } catch (_) {
            rows = [];
        }

        // Also scan home-sections.json and country-packages if available
        if (fs.existsSync(homeCachePath)) {
            try {
                const homeData = JSON.parse(fs.readFileSync(homeCachePath, 'utf8'));
                if (Array.isArray(homeData.sections)) {
                    homeData.sections.forEach(sec => {
                        const secType = sec.content_type === 'series' ? 'series' : 'movie';
                        if (typeFilter && typeFilter !== 'all') {
                            if ((typeFilter === 'movie' || typeFilter === 'vod') && secType !== 'movie') return;
                            if (typeFilter === 'series' && secType !== 'series') return;
                        }
                        if (Array.isArray(sec.entries)) {
                            sec.entries.forEach(entry => {
                                const entryName = String(entry.name || entry.title || '').trim();
                                const normEntry = entryName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                                if (tokens.every(tok => normEntry.includes(tok))) {
                                    rows.push({
                                        source_id: entry.sourceId || entry.source_id || 1,
                                        item_id: entry.streamId || entry.stream_id || entry.id,
                                        type: secType,
                                        name: entryName,
                                        stream_icon: entry.thumbUrl || entry.stream_icon || entry.cover || '',
                                        container_extension: entry.containerExtension || entry.container_extension || '',
                                        rating: entry.rating || '',
                                        year: entry.year || '',
                                        data: JSON.stringify(entry),
                                        cat_name: sec.title || ''
                                    });
                                }
                            });
                        }
                    });
                }
            } catch (_) {}
        }

        const countryId = String(req.query.country_id || 'all').trim();
        const matcher = (countryId && countryId !== 'all' && countryId !== 'default')
            ? (HERO_COUNTRY_MATCHERS.find(m => m.id === countryId || m.altId === countryId) ||
               HERO_COUNTRY_MATCHERS.find(m => m.code === 'US'))
            : null;

        // Prioritize rows matching selected country (if specific country is selected) BEFORE deduplication
        if (matcher) {
            rows.sort((a, b) => {
                const matchA = matcher.patterns.some(p => p.test(`${a.cat_name || ''} ${a.name || ''}`));
                const matchB = matcher.patterns.some(p => p.test(`${b.cat_name || ''} ${b.name || ''}`));
                if (matchA && !matchB) return -1;
                if (!matchA && matchB) return 1;
                return 0;
            });
        }

        const candidates = [];
        const seen = new Set();

        for (const r of rows) {
            let tmdbId = '';
            try {
                if (r.data) {
                    const parsed = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
                    tmdbId = String(parsed.tmdb || parsed.tmdb_id || parsed.tmdbId || '').trim();
                }
            } catch (_) {}

            const year = r.year || extractYear(r.name) || extractYear(r.cat_name) || '';
            const clean = cleanItemName(r.name);
            const key = `${r.source_id}:${r.item_id}`;
            if (!seen.has(key)) {
                seen.add(key);
                candidates.push({
                    streamId: r.item_id,
                    sourceId: r.source_id,
                    name: r.name,
                    cleanTitle: clean || r.name,
                    year: year,
                    tmdbId: tmdbId,
                    type: r.type === 'movie' ? 'vod' : r.type,
                    thumbUrl: r.stream_icon || '',
                    containerExtension: r.container_extension || '',
                    categoryName: r.cat_name || '',
                    rating: r.rating || ''
                });
            }
        }

        // Sort candidates: newer years first, then clean title
        candidates.sort((a, b) => {
            const yearA = parseInt(a.year, 10) || 0;
            const yearB = parseInt(b.year, 10) || 0;
            if (yearB !== yearA) return yearB - yearA;
            return a.cleanTitle.localeCompare(b.cleanTitle, 'fr');
        });

        return res.json(candidates.slice(0, 200));
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.post('/hero-slider/smart-match-countries', (req, res) => {
    try {
        const { selectedItem } = req.body || {};
        if (!selectedItem || (!selectedItem.cleanTitle && !selectedItem.tmdbId)) {
            return res.status(400).json({ error: 'selectedItem with cleanTitle or tmdbId is required' });
        }

        const db = getDb();
        const allCountries = allRows('admin_countries').sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
        const cleanTitle = (selectedItem.cleanTitle || selectedItem.name || '').trim();
        const tmdbId = String(selectedItem.tmdbId || '').trim();
        const year = String(selectedItem.year || '').trim();
        const type = selectedItem.type === 'series' ? 'series' : 'movie';

        let rows = [];
        if (tmdbId) {
            // Precision TMDB ID search across ALL countries and all source catalogs!
            rows = db.prepare(`
                SELECT p.source_id, p.item_id, p.type, p.name, p.stream_icon, p.container_extension, p.rating, p.year, p.data, c.name as cat_name
                FROM playlist_items p
                LEFT JOIN categories c ON p.source_id = c.source_id AND p.category_id = c.category_id
                WHERE (p.data LIKE ? OR p.data LIKE ?) AND p.is_hidden = 0
                LIMIT 250
            `).all(`%"tmdb":${tmdbId}%`, `%"tmdb":"${tmdbId}"%`);
        }

        if (!rows.length && cleanTitle) {
            // Fallback to strict clean title search
            const nameRows = db.prepare(`
                SELECT p.source_id, p.item_id, p.type, p.name, p.stream_icon, p.container_extension, p.rating, p.year, p.data, c.name as cat_name
                FROM playlist_items p
                LEFT JOIN categories c ON p.source_id = c.source_id AND p.category_id = c.category_id
                WHERE p.name LIKE ? AND p.type = ? AND p.is_hidden = 0
                LIMIT 250
            `).all(`%${cleanTitle}%`, type);

            rows = nameRows.filter(r => {
                if (!year) return true;
                const rYear = r.year || extractYear(r.name) || extractYear(r.cat_name);
                return !rYear || rYear === year;
            });
            if (!rows.length) rows = nameRows;
        }

        const matchesByCountry = new Map();

        for (const row of rows) {
            const detected = matchItemToCountry(row.cat_name, row.name);
            const streamObj = {
                streamId: row.item_id,
                sourceId: row.source_id,
                globalStreamId: row.item_id,
                name: row.name,
                thumbUrl: row.stream_icon || selectedItem.thumbUrl || '',
                containerExtension: row.container_extension || '',
                contentType: row.type === 'movie' ? 'vod' : row.type,
                rating: row.rating || selectedItem.rating || '',
                year: row.year || year,
                categoryName: row.cat_name || ''
            };

            if (detected) {
                if (!matchesByCountry.has(detected.id)) matchesByCountry.set(detected.id, streamObj);
                if (detected.altId && !matchesByCountry.has(detected.altId)) matchesByCountry.set(detected.altId, streamObj);
            }
        }

        const usaFallback = {
            streamId: selectedItem.streamId,
            sourceId: selectedItem.sourceId,
            globalStreamId: selectedItem.streamId,
            name: selectedItem.name,
            thumbUrl: selectedItem.thumbUrl || '',
            containerExtension: selectedItem.containerExtension || '',
            contentType: type === 'series' ? 'series' : 'vod',
            rating: selectedItem.rating || '',
            year: year,
            tmdbId: tmdbId
        };

        const countryAvailability = allCountries.map(c => {
            const match = matchesByCountry.get(c.id) || null;
            return {
                countryId: c.id,
                countryName: c.name,
                found: !!match,
                match: match || usaFallback,
                isFallback: !match
            };
        });

        return res.json({
            selectedItem,
            usaFallback,
            countries: countryAvailability
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.delete('/hero-slider/country-override', (req, res) => {
    try {
        const id = String(req.query.id || '').trim();
        const countryId = String(req.query.country_id || '').trim();
        if (!id || !countryId) return res.status(400).json({ error: 'id and country_id are required' });

        const rows = allRows('admin_hero_slider');
        const item = rows.find(r => r.id === id);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        const excluded = Array.isArray(item.excluded_countries) ? item.excluded_countries.slice() : [];
        if (!excluded.includes(countryId)) excluded.push(countryId);

        const mappings = Object.assign({}, item.country_mappings || {});
        if (mappings[countryId]) {
            mappings[countryId] = Object.assign({}, mappings[countryId], { hidden: true });
        }

        const updated = Object.assign({}, item, {
            excluded_countries: excluded,
            country_mappings: mappings
        });

        saveRow('admin_hero_slider', updated, req);
        return res.json({ ok: true, item: updated });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.get('/hero-slider/scan-availability', (req, res) => {
    try {
        const query = String(req.query.q || '').trim();
        const typeFilter = String(req.query.type || '').trim().toLowerCase();
        if (!query) {
            return res.json({ query: '', countries: [], usaFallback: null });
        }

        const db = getDb();
        const allCountries = allRows('admin_countries').sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
        
        let typeClause = '';
        const params = [`%${query}%`];
        if (typeFilter === 'movie' || typeFilter === 'vod') {
            typeClause = ' AND p.type = "movie"';
        } else if (typeFilter === 'series') {
            typeClause = ' AND p.type = "series"';
        }

        const rows = db.prepare(`
            SELECT p.source_id, p.item_id, p.type, p.name, p.stream_icon, p.container_extension, p.rating, p.year, c.name as cat_name
            FROM playlist_items p
            LEFT JOIN categories c ON p.source_id = c.source_id AND p.category_id = c.category_id
            WHERE p.name LIKE ? AND p.is_hidden = 0${typeClause}
            LIMIT 250
        `).all(...params);

        const matchesByCountry = new Map();
        let usaFallbackMatch = null;

        for (const row of rows) {
            const detected = matchItemToCountry(row.cat_name, row.name);
            const streamObj = {
                streamId: row.item_id,
                sourceId: row.source_id,
                globalStreamId: row.item_id,
                name: row.name,
                thumbUrl: row.stream_icon || '',
                containerExtension: row.container_extension || '',
                contentType: row.type === 'movie' ? 'vod' : row.type,
                rating: row.rating || '',
                year: row.year || '',
                categoryName: row.cat_name || ''
            };

            if (detected) {
                if (!matchesByCountry.has(detected.id)) {
                    matchesByCountry.set(detected.id, streamObj);
                }
                if (detected.altId && !matchesByCountry.has(detected.altId)) {
                    matchesByCountry.set(detected.altId, streamObj);
                }
                if (detected.code === 'US' && !usaFallbackMatch) {
                    usaFallbackMatch = streamObj;
                }
            } else if (!usaFallbackMatch) {
                usaFallbackMatch = streamObj;
            }
        }

        if (!usaFallbackMatch && rows.length > 0) {
            const first = rows[0];
            usaFallbackMatch = {
                streamId: first.item_id,
                sourceId: first.source_id,
                globalStreamId: first.item_id,
                name: first.name,
                thumbUrl: first.stream_icon || '',
                containerExtension: first.container_extension || '',
                contentType: first.type === 'movie' ? 'vod' : first.type,
                rating: first.rating || '',
                year: first.year || '',
                categoryName: first.cat_name || ''
            };
        }

        const countryAvailability = allCountries.map(c => {
            const match = matchesByCountry.get(c.id) || null;
            return {
                countryId: c.id,
                countryName: c.name,
                found: !!match,
                match: match || usaFallbackMatch || null,
                isFallback: !match && !!usaFallbackMatch
            };
        });

        return res.json({
            query,
            totalMatchesFound: rows.length,
            usaFallback: usaFallbackMatch,
            countries: countryAvailability
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.post('/hero-slider/bulk-assign', (req, res) => {
    try {
        const { title, category, badge, image, backdrop, overview, query, manualMappings } = req.body || {};
        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const db = getDb();
        const allCountries = allRows('admin_countries');
        const searchQuery = String(query || title).trim();
        
        const rows = db.prepare(`
            SELECT p.source_id, p.item_id, p.type, p.name, p.stream_icon, p.container_extension, p.rating, p.year, c.name as cat_name
            FROM playlist_items p
            LEFT JOIN categories c ON p.source_id = c.source_id AND p.category_id = c.category_id
            WHERE p.name LIKE ? AND p.is_hidden = 0
            LIMIT 250
        `).all(`%${searchQuery}%`);

        const matchesByCountry = new Map();
        let usaFallback = null;

        for (const row of rows) {
            const detected = matchItemToCountry(row.cat_name, row.name);
            const streamObj = {
                streamId: row.item_id,
                sourceId: row.source_id,
                globalStreamId: row.item_id,
                name: row.name,
                thumbUrl: row.stream_icon || '',
                containerExtension: row.container_extension || '',
                contentType: row.type === 'movie' ? 'vod' : row.type,
                rating: row.rating || '',
                year: row.year || ''
            };

            if (detected) {
                if (!matchesByCountry.has(detected.id)) matchesByCountry.set(detected.id, streamObj);
                if (detected.altId && !matchesByCountry.has(detected.altId)) matchesByCountry.set(detected.altId, streamObj);
                if (detected.code === 'US' && !usaFallback) usaFallback = streamObj;
            } else if (!usaFallback) {
                usaFallback = streamObj;
            }
        }

        if (!usaFallback && rows.length > 0) {
            const first = rows[0];
            usaFallback = {
                streamId: first.item_id,
                sourceId: first.source_id,
                globalStreamId: first.item_id,
                name: first.name,
                thumbUrl: first.stream_icon || '',
                containerExtension: first.container_extension || '',
                contentType: first.type === 'movie' ? 'vod' : first.type,
                rating: first.rating || '',
                year: first.year || ''
            };
        }

        const countryMappings = {};
        for (const c of allCountries) {
            if (manualMappings && manualMappings[c.id]) {
                countryMappings[c.id] = manualMappings[c.id];
            } else if (matchesByCountry.has(c.id)) {
                countryMappings[c.id] = matchesByCountry.get(c.id);
            } else if (usaFallback) {
                countryMappings[c.id] = { ...usaFallback, isFallback: true };
            }
        }

        if (usaFallback) {
            countryMappings['country_usa'] = countryMappings['country_usa'] || usaFallback;
            countryMappings['default'] = usaFallback;
        }

        const currentSliders = allRows('admin_hero_slider');
        const nextOrder = currentSliders.length ? Math.max(...currentSliders.map(s => Number(s.sort_order) || 0)) + 1 : 0;
        const sliderId = req.body.id || `hero_slider_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        const sliderItem = {
            id: sliderId,
            title: String(title).trim(),
            category: category || (usaFallback?.contentType === 'series' ? 'series' : 'movie'),
            badge: badge || 'Top Trending',
            image: image || usaFallback?.thumbUrl || '',
            backdrop: backdrop || image || usaFallback?.thumbUrl || '',
            overview: overview || '',
            sort_order: req.body.sort_order !== undefined ? Number(req.body.sort_order) : nextOrder,
            published: req.body.published !== false,
            country_mappings: countryMappings
        };

        saveRow('admin_hero_slider', sliderItem, req);
        return res.json({ ok: true, item: sliderItem });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.post('/admin/sync-packages', (req, res) => {
    try {
        invalidateCountryPackageCache();
        const db = getDb();
        const countItems = db.prepare(`
            SELECT COUNT(*) AS count
            FROM playlist_items
            WHERE source_id = ? AND type = ? AND category_id = ? AND is_hidden = 0
        `);
        let itemCount = 0;
        let packageCount = 0;
        const resolvedPackages = resolvedAdminPackages(
            allRows('admin_packages'),
            allRows('admin_stream_curations')
        );
        for (const packageRow of resolvedPackages) {
            const sourceId = Number.parseInt(packageRow.source_id, 10);
            const categoryId = String(packageRow.category_id || '').trim();
            const itemType = catalogueItemType(String(packageRow.kind || '').trim());
            if (!Number.isInteger(sourceId) || !categoryId || !itemType) continue;
            packageCount += 1;
            itemCount += Number(countItems.get(sourceId, itemType, categoryId)?.count || 0);
        }
        const countryPackageCache = buildCountryPackageCache();
        const homeCache = buildHomeCache();
        return res.json({
            ok: true,
            packages: packageCount,
            items: itemCount,
            homeSections: homeCache.sections.length,
            homeEntries: homeCache.sections.reduce((total, section) => total + section.entries.length, 0),
            mappedMemberships: countryPackageCache.counts.memberships,
            generatedAt: homeCache.generatedAt
        });
    } catch (error) {
        console.error('[Velora data] Package synchronization failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.post('/admin/assign-package', (req, res) => {
    try {
        const countryId = String(req.body?.countryId || '').trim();
        const packageName = String(req.body?.packageName || '').trim();
        const sourceId = Number.parseInt(req.body?.sourceId, 10);
        const categoryId = String(req.body?.categoryId || '').trim();
        const kind = String(req.body?.kind || '').trim();
        const itemType = kind === 'vod' ? 'movie' : kind;
        const uiTab = kind === 'vod' ? 'movies' : kind;
        if (!countryId || !packageName || !Number.isInteger(sourceId) || !categoryId || !['live', 'movie', 'series'].includes(itemType)) {
            return res.status(400).json({ error: 'countryId, packageName, sourceId, categoryId and kind are required' });
        }

        invalidateCountryPackageCache();
        const db = getDb();
        const result = db.transaction(() => {
            const countryPackages = allRows('admin_packages').filter(row =>
                String(row.country_id) === countryId
            );
            let target = countryPackages.find(row =>
                Number.parseInt(row.source_id, 10) === sourceId
                && String(row.category_id || '') === categoryId
                && String(row.kind || '') === kind
            );
            // Legacy rows had no catalogue identity. Claim one once and enrich it.
            if (!target) {
                target = countryPackages.find(row =>
                    String(row.name) === packageName
                    && !String(row.source_id || '').trim()
                    && !String(row.category_id || '').trim()
                );
            }
            if (!target) {
                target = saveRow('admin_packages', {
                    country_id: countryId,
                    name: packageName,
                    source_id: sourceId,
                    category_id: categoryId,
                    kind
                }, req);
            } else if (Number.parseInt(target.source_id, 10) !== sourceId
                || String(target.category_id || '') !== categoryId
                || String(target.kind || '') !== kind) {
                target = saveRow('admin_packages', {
                    ...target,
                    source_id: sourceId,
                    category_id: categoryId,
                    kind
                }, req);
            }

            const itemIds = db.prepare(`
                SELECT item_id FROM playlist_items
                WHERE source_id = ? AND type = ? AND category_id = ?
            `).all(sourceId, itemType, categoryId).map(row => String(row.item_id));

            const curationKey = row => {
                const rowKind = String(row.kind || '');
                const rowSource = String(row.source_id || '');
                return rowKind && rowSource
                    ? `${rowKind}:${rowSource}:${String(row.stream_id)}`
                    : String(row.stream_id);
            };
            const existingCurations = new Map(allRows('admin_stream_curations')
                .filter(row => String(row.country_id) === countryId)
                .map(row => [curationKey(row), row]));
            const upsert = db.prepare(`
                INSERT INTO velora_admin_rows (table_name, row_id, data)
                VALUES ('admin_stream_curations', ?, ?)
                ON CONFLICT(table_name, row_id) DO UPDATE SET
                    data = excluded.data,
                    updated_at = CURRENT_TIMESTAMP
            `);
            for (const streamId of itemIds) {
                const identity = `${kind}:${sourceId}:${streamId}`;
                const existing = existingCurations.get(identity);
                const row = {
                    ...(existing || {}),
                    id: String(existing?.id || crypto.randomUUID()),
                    stream_id: streamId,
                    country_id: countryId,
                    target_package_id: target.id,
                    source_id: sourceId,
                    kind
                };
                upsert.run(row.id, JSON.stringify(row));
            }

            const orderRequest = {
                query: { on_conflict: 'country_id,ui_tab' },
                get: name => name === 'Prefer' ? 'resolution=merge-duplicates' : ''
            };
            const existingOrder = allRows('admin_country_package_order').find(row =>
                String(row.country_id) === countryId && String(row.ui_tab) === uiTab
            );
            const packageOrder = Array.isArray(existingOrder?.package_order)
                ? existingOrder.package_order.map(String) : [];
            if (!packageOrder.includes(String(target.id))) packageOrder.push(String(target.id));
            saveRow('admin_country_package_order', {
                ...(existingOrder || {}),
                country_id: countryId,
                ui_tab: uiTab,
                package_order: packageOrder,
                updated_at: new Date().toISOString()
            }, orderRequest);

            return { packageId: target.id, itemCount: itemIds.length };
        })();
        return res.json({ ok: true, ...result });
    } catch (error) {
        console.error('[Velora data] Package assignment failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

router.all('/rest/v1/:table', (req, res) => {
    const table = req.params.table;
    if (!ALLOWED_TABLES.has(table)) {
        return res.status(404).json({
            code: 'PGRST205',
            message: `Unknown local Velora table: ${table}`
        });
    }

    try {
        if (req.method === 'GET' || req.method === 'HEAD') {
            let rows = sortRows(
                allRows(table).filter(row => matches(row, req.query)),
                req.query.order
            );
            const total = rows.length;
            let start = Number(req.query.offset || 0);
            let end = req.query.limit ? start + Number(req.query.limit) - 1 : total - 1;
            const range = /^(\d+)-(\d+)$/.exec(String(req.get('Range') || ''));
            if (range) {
                start = Number(range[1]);
                end = Number(range[2]);
            }
            rows = rows.slice(start, Math.max(start, end + 1))
                .map(row => project(row, req.query.select));
            res.set('Content-Range', `${start}-${Math.max(start, start + rows.length - 1)}/${total}`);
            res.set('Range-Unit', 'items');
            if (req.method === 'HEAD') return res.status(200).end();
            if (String(req.get('Accept') || '').includes('application/vnd.pgrst.object+json')) {
                if (rows.length !== 1) {
                    return res.status(406).json({
                        code: 'PGRST116',
                        message: `JSON object requested, multiple (or no) rows returned`
                    });
                }
                return res.json(rows[0]);
            }
            return res.json(rows);
        }

        if (req.method === 'POST') {
            invalidateDerivedCachesForTable(table);
            const values = Array.isArray(req.body) ? req.body : [req.body];
            const saved = getDb().transaction(() => values.map(value => saveRow(table, value, req)))();
            const representation = String(req.get('Prefer') || '').includes('return=representation');
            return representation ? res.status(201).json(saved) : res.status(201).end();
        }

        const rows = allRows(table).filter(row => matches(row, req.query));
        if (req.method === 'PATCH') {
            if (rows.length) invalidateDerivedCachesForTable(table);
            const saved = getDb().transaction(() =>
                rows.map(row => saveRow(table, { ...row, ...req.body }, req))
            )();
            const representation = String(req.get('Prefer') || '').includes('return=representation');
            return representation ? res.json(saved) : res.status(204).end();
        }

        if (req.method === 'DELETE') {
            if (rows.length) invalidateDerivedCachesForTable(table);
            const remove = getDb().prepare(
                `DELETE FROM velora_admin_rows WHERE table_name = ? AND row_id = ?`
            );
            getDb().transaction(() => rows.forEach(row => remove.run(table, String(row.id))))();
            if (table === 'admin_home_sections' && rows.length > 0) {
                try {
                    buildHomeCache();
                } catch (error) {
                    console.error('[Velora data] Home cache rebuild after section deletion failed:', error);
                }
            }
            const representation = String(req.get('Prefer') || '').includes('return=representation');
            return representation ? res.json(rows) : res.status(204).end();
        }

        return res.sendStatus(405);
    } catch (error) {
        console.error('[Velora data]', error);
        return res.status(400).json({
            code: 'VELORA_SQLITE_ERROR',
            message: error.message
        });
    }
});

module.exports = router;
module.exports.buildHomeCache = buildHomeCache;
module.exports.buildCountryPackageCache = buildCountryPackageCache;
module.exports.invalidateCountryPackageCache = invalidateCountryPackageCache;
module.exports.getCountryPackageCache = getCountryPackageCache;
module.exports.expandMemberships = expandMemberships;
module.exports.saveRow = saveRow;
module.exports.allRows = allRows;
