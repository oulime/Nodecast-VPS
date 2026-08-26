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
const COUNTRY_PACKAGE_TABLES = new Set([
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
    removeCacheFile(countryPackageCachePath);
    // Home sections are another derived view of the same package memberships.
    removeCacheFile(homeCachePath);
}

function invalidateHomeCache() {
    removeCacheFile(homeCachePath);
}

function invalidateDerivedCachesForTable(table) {
    if (COUNTRY_PACKAGE_TABLES.has(table)) invalidateCountryPackageCache();
    else if (table === 'admin_home_sections' || HOME_CHANNEL_RULE_TABLES.has(table)) invalidateHomeCache();
}

function homeChannelNameRules() {
    const prefixes = [...new Set(allRows('admin_channel_name_prefixes')
        .map(row => String(row.prefix || '').trim()).filter(Boolean))]
        .sort((left, right) => right.length - left.length);
    const hiddenFilters = [...new Set([
        ...DEFAULT_CHANNEL_HIDDEN_FILTERS,
        ...allRows('admin_hidden_filters').map(row => String(row.needle || '').trim()).filter(Boolean)
    ])].sort((left, right) => right.length - left.length);
    return { prefixes, hiddenFilters };
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

function stripHomeChannelPrefixes(rawName, prefixes) {
    const original = String(rawName || '').trim();
    let name = original;
    for (let pass = 0; pass < 64; pass += 1) {
        const prefix = prefixes.find(candidate =>
            candidate.length <= name.length
            && name.slice(0, candidate.length).toLowerCase() === candidate.toLowerCase()
        );
        if (!prefix) break;
        name = name.slice(prefix.length).trim();
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
    'admin_channel_name_prefixes',
    'admin_countries',
    'admin_country_package_order',
    'admin_global_package_allowlist',
    'admin_global_package_open_confirm',
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
    admin_countries: ['name'],
    admin_country_package_order: ['country_id', 'ui_tab'],
    admin_global_package_allowlist: ['stream_id'],
    admin_global_package_open_confirm: ['id'],
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
    const requested = String(req.query.on_conflict || '')
        .split(',').map(value => value.trim()).filter(Boolean);
    return requested.length ? requested : (NATURAL_KEYS[table] || ['id']);
}

function findConflict(table, row, fields) {
    if (!fields.length || fields.some(field => row[field] == null)) return null;
    return allRows(table).find(candidate =>
        fields.every(field => String(candidate[field]) === String(row[field]))
    ) || null;
}

function saveRow(table, input, req) {
    const db = getDb();
    const row = { ...input };
    const merge = String(req.get('Prefer') || '').includes('resolution=merge-duplicates');
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
    const output = sections.map(section => {
        const type = ['live', 'movies', 'series'].includes(section.content_type)
            ? section.content_type : 'live';
        const packageRow = packages.get(String(section.package_id)) || {};
        const providerSourceId = String(packageRow.source_id ?? '').trim();
        const providerCategoryId = String(packageRow.category_id ?? '').trim();
        const providerKind = String(packageRow.kind ?? '').trim();
        const expectedKind = type === 'movies' ? 'vod' : type;
        const membership = packageStreams.get(String(section.package_id)) || { keys: new Set(), sourceAware: false };
        const providerBacked = providerSourceId && providerCategoryId && providerKind === expectedKind;
        const entries = snapshots[type].filter(item => {
            const rawId = item.raw_stream_id ?? item.raw_series_id ?? item.stream_id ?? item.series_id;
            const sourceId = String(item.source_id ?? item.nodecast_source_id ?? '').trim();
            // Effective memberships include both provider defaults and explicit
            // moves. Prefer them whenever available so Home follows media moved
            // into or out of provider-backed Movie and Series packages.
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
            return {
                id: `home-cache:${section.id}:${rawId}`,
                name: type === 'live' ? stripHomeChannelPrefixes(rawName, channelRules.prefixes) : rawName,
                thumbUrl: String(item.stream_icon || item.cover || ''),
                streamId: rawId,
                sourceId: item.source_id,
                globalStreamId: item.global_stream_id || item.stream_id,
                containerExtension: item.container_extension || '',
                contentType: type,
                packageId: section.package_id
            };
        }).filter(item => item?.name).slice(0, HOME_CACHE_ENTRIES_PER_PACKAGE);
        return { ...section, content_type: type, entries };
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
            const countrySections = sections.filter(section =>
                section.published !== false && String(section.country_id || '') === countryId
            );
            sections = countrySections.length ? countrySections : sections.filter(section =>
                section.published !== false && (!section.country_id || section.country_id === 'default')
            );
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

router.post('/home-cache/rebuild', async (req, res) => {
    try {
        // Never trust browser-computed section entries here. Rebuild from the
        // server-side effective memberships so each Home section contains only
        // content that currently belongs to its configured country/package.
        const payload = buildHomeCache();
        await enrichHomeCacheMoviePosters(payload);
        writeJsonAtomic(homeCachePath, payload);
        return res.json({ ok: true, generatedAt: payload.generatedAt, sections: payload.sections.length,
            entries: payload.sections.reduce((total, section) => total + section.entries.length, 0) });
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
