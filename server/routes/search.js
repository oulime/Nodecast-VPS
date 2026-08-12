const express = require('express');
const { sources } = require('../db');
const xtreamApi = require('../services/xtreamApi');
const veloraCatalogCache = require('../services/veloraCatalogCache');
const veloraData = require('./veloraData');

const router = express.Router();
const MAX_CATEGORIES = 200;
const MAX_RESULTS = 150;
const MAX_INDEXED_CATEGORIES = 400;
const MAX_ALLOWED_ITEMS = 100000;
const DEFAULT_REMOTE_SEARCH_BASE = 'https://nodecast.veloravip.net';
const REMOTE_SEARCH_BASE = String(
    process.env.VELORA_SEARCH_REMOTE_BASE ||
    process.env.VELORA_CATALOG_REMOTE_BASE ||
    DEFAULT_REMOTE_SEARCH_BASE
).trim().replace(/\/+$/, '');
const categorySearchIndex = new Map();
const countryScopeIndex = new Map();
let indexedSnapshotVersion = null;

function encodeGlobalId(sourceId, itemId) {
    return Buffer.from(`${sourceId}:${itemId}`).toString('base64url');
}

function cleanText(value, maxLength) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeCategories(input) {
    if (!Array.isArray(input)) return [];

    const seen = new Set();
    const categories = [];
    for (const raw of input) {
        if (!raw || typeof raw !== 'object') continue;
        const sourceId = Number.parseInt(raw.sourceId, 10);
        const categoryId = cleanText(raw.categoryId, 160);
        const packageId = cleanText(raw.packageId, 240);
        const packageName = cleanText(raw.packageName, 240);
        if (!Number.isFinite(sourceId) || !categoryId || !packageId) continue;

        const key = `${sourceId}\u001f${categoryId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        categories.push({ sourceId, categoryId, packageId, packageName, priority: raw.priority === true });
        if (categories.length >= MAX_CATEGORIES) break;
    }
    return categories;
}

function getItemId(item, type) {
    if (type === 'series') return item.raw_series_id ?? item.raw_stream_id ?? item.series_id;
    return item.raw_stream_id ?? item.stream_id;
}

function getItemCategoryIds(item) {
    const values = Array.isArray(item.category_ids) ? item.category_ids : [item.category_id];
    return values.map(value => String(value ?? '').trim()).filter(Boolean);
}

function normalizeAllowedItems(input) {
    if (!Array.isArray(input)) return new Set();
    return new Set(input
        .slice(0, MAX_ALLOWED_ITEMS)
        .map(value => cleanText(value, 500))
        .filter(Boolean));
}

function membershipMatchesType(kind, type) {
    const normalizedKind = normalizeText(kind);
    if (!normalizedKind) return true;
    if (type === 'movie') return ['movie', 'movies', 'vod'].includes(normalizedKind);
    if (type === 'series') return normalizedKind === 'series';
    return ['live', 'tv', 'channel', 'channels'].includes(normalizedKind);
}

function getCountrySearchScope(countryId, type) {
    const normalizedCountryId = cleanText(countryId, 240);
    if (!normalizedCountryId) return null;

    const cache = veloraData.getCountryPackageCache();
    const cacheVersion = `${cache.catalogSnapshotVersion || ''}:${cache.generatedAt || ''}`;
    const indexKey = `${cacheVersion}\u001f${normalizedCountryId}\u001f${type}`;
    const existing = countryScopeIndex.get(indexKey);
    if (existing) {
        countryScopeIndex.delete(indexKey);
        countryScopeIndex.set(indexKey, existing);
        return existing;
    }

    const packages = new Map((cache.packages || [])
        .filter(pkg => String(pkg.country_id || '') === normalizedCountryId)
        .map(pkg => [String(pkg.id), {
            packageId: String(pkg.id),
            packageName: cleanText(pkg.name, 240),
            priority: true
        }]));
    const byRawItem = new Map();
    const bySourceItem = new Map();
    for (const membership of veloraData.expandMemberships(cache.memberships)) {
        if (String(membership.country_id || '') !== normalizedCountryId) continue;
        if (!membershipMatchesType(membership.kind, type)) continue;
        const assignment = packages.get(String(membership.target_package_id || ''));
        const itemId = cleanText(membership.stream_id, 500);
        if (!assignment || !itemId) continue;
        if (!byRawItem.has(itemId)) byRawItem.set(itemId, assignment);
        const sourceId = cleanText(membership.source_id, 80);
        if (sourceId) bySourceItem.set(`${sourceId}\u001f${itemId}`, assignment);
    }

    const scope = { countryId: normalizedCountryId, byRawItem, bySourceItem };
    countryScopeIndex.set(indexKey, scope);
    while (countryScopeIndex.size > 128) {
        countryScopeIndex.delete(countryScopeIndex.keys().next().value);
    }
    return scope;
}

function getCountryItemAssignment(scope, sourceId, itemId) {
    if (!scope) return null;
    const rawItemId = String(itemId);
    return scope.bySourceItem.get(`${sourceId}\u001f${rawItemId}`)
        || scope.byRawItem.get(rawItemId)
        || null;
}

function isAllowedWildcardItem(allowedItems, sourceId, itemId, type) {
    if (!allowedItems.size) return false;
    const rawItemId = String(itemId);
    const rawSourceId = String(sourceId);
    const kind = type === 'movie' ? 'vod' : type;
    return allowedItems.has(rawItemId)
        || allowedItems.has(`${kind}:${rawSourceId}:${rawItemId}`)
        || allowedItems.has(Buffer.from(`${rawSourceId}:${rawItemId}`).toString('base64url'));
}

function resolveSearchCategory(item, categoryMap, sourceId, type, allowedItems) {
    const exact = getItemCategoryIds(item)
        .map(categoryId => categoryMap.get(categoryId))
        .find(Boolean);
    if (exact) return exact;

    const wildcard = categoryMap.get('*');
    const itemId = getItemId(item, type);
    return wildcard && itemId != null && isAllowedWildcardItem(allowedItems, sourceId, itemId, type)
        ? wildcard
        : null;
}

function getSnapshotAction(type) {
    if (type === 'movie') return 'vod_streams';
    if (type === 'series') return 'series';
    return 'live_streams';
}

function setCategoryIndex(key, rows) {
    if (categorySearchIndex.has(key)) categorySearchIndex.delete(key);
    categorySearchIndex.set(key, rows);
    while (categorySearchIndex.size > MAX_INDEXED_CATEGORIES) {
        categorySearchIndex.delete(categorySearchIndex.keys().next().value);
    }
}

async function getIndexedCategory(action, category, snapshotVersion, type) {
    const key = `${snapshotVersion}\u001f${action}\u001f${category.sourceId}\u001f${category.categoryId}`;
    const existing = categorySearchIndex.get(key);
    if (existing) {
        categorySearchIndex.delete(key);
        categorySearchIndex.set(key, existing);
        return existing;
    }

    const snapshotRows = await veloraCatalogCache.getCategorySnapshot(
        action,
        category.sourceId,
        category.categoryId
    );
    const indexedRows = (snapshotRows || []).map(item => {
        const itemId = getItemId(item, type);
        const name = cleanText(item.name || item.title || item.series_name, 500);
        if (itemId === undefined || itemId === null || !name) return null;
        return {
            sourceId: category.sourceId,
            itemId: String(itemId),
            normalizedName: normalizeText(name),
            name,
            streamIcon: cleanText(item.stream_icon || item.cover, 2000),
            containerExtension: cleanText(item.container_extension, 32),
            categoryId: category.categoryId
        };
    }).filter(Boolean);
    setCategoryIndex(key, indexedRows);
    return indexedRows;
}

async function getIndexedSnapshot(action, snapshotVersion, type) {
    const key = `${snapshotVersion}\u001f${action}\u001f*`;
    const existing = categorySearchIndex.get(key);
    if (existing) {
        categorySearchIndex.delete(key);
        categorySearchIndex.set(key, existing);
        return existing;
    }

    const snapshotRows = veloraCatalogCache.getSnapshot(action) || [];
    const indexedRows = snapshotRows.map(item => {
        const sourceId = Number.parseInt(item.source_id, 10);
        const itemId = getItemId(item, type);
        const name = cleanText(item.name || item.title || item.series_name, 500);
        if (!Number.isInteger(sourceId) || itemId == null || !name) return null;
        return {
            sourceId,
            itemId: String(itemId),
            normalizedName: normalizeText(name),
            name,
            streamIcon: cleanText(item.stream_icon || item.cover, 2000),
            containerExtension: cleanText(item.container_extension, 32),
            categoryId: cleanText(item.raw_category_id || item.category_id, 160)
        };
    }).filter(Boolean);
    setCategoryIndex(key, indexedRows);
    return indexedRows;
}

async function getIndexedCountrySnapshot(action, snapshotVersion, type, countryScope) {
    const key = `${snapshotVersion}\u001f${action}\u001fcountry:${countryScope.countryId}`;
    const existing = categorySearchIndex.get(key);
    if (existing) {
        categorySearchIndex.delete(key);
        categorySearchIndex.set(key, existing);
        return existing;
    }

    const snapshotRows = veloraCatalogCache.getSnapshot(action) || [];
    const indexedRows = snapshotRows.map(item => {
        const sourceId = Number.parseInt(item.source_id, 10);
        const itemId = getItemId(item, type);
        const name = cleanText(item.name || item.title || item.series_name, 500);
        if (!Number.isInteger(sourceId) || itemId == null || !name) return null;
        const countryAssignment = getCountryItemAssignment(countryScope, sourceId, itemId);
        if (!countryAssignment) return null;
        return {
            sourceId,
            itemId: String(itemId),
            normalizedName: normalizeText(name),
            name,
            streamIcon: cleanText(item.stream_icon || item.cover, 2000),
            containerExtension: cleanText(item.container_extension, 32),
            categoryId: cleanText(item.raw_category_id || item.category_id, 160),
            countryAssignment
        };
    }).filter(Boolean);
    setCategoryIndex(key, indexedRows);
    return indexedRows;
}

async function searchSnapshot(categories, type, normalizedQuery, limit, allowedItems = new Set(), countryScope = null) {
    const status = veloraCatalogCache.getStatus();
    const snapshotSourceIds = new Set((status.sourceIds || []).map(Number));
    const requestedSourceIds = [...new Set(categories.map(category => category.sourceId))];
    const available = Boolean(
        status.ready &&
        status.snapshotVersion &&
        requestedSourceIds.length &&
        requestedSourceIds.every(sourceId => snapshotSourceIds.has(sourceId))
    );
    if (!available) return { available: false, results: [] };

    if (indexedSnapshotVersion !== status.snapshotVersion) {
        categorySearchIndex.clear();
        indexedSnapshotVersion = status.snapshotVersion;
    }

    const action = getSnapshotAction(type);
    const indexedCategories = await Promise.all(
        categories.map(category => category.categoryId === '*'
            ? countryScope
                ? getIndexedCountrySnapshot(action, status.snapshotVersion, type, countryScope)
                : getIndexedSnapshot(action, status.snapshotVersion, type)
            : getIndexedCategory(action, category, status.snapshotVersion, type))
    );
    const results = [];
    const seenItems = new Set();
    for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
        const category = categories[categoryIndex];
        for (const item of indexedCategories[categoryIndex]) {
            const countryAssignment = category.categoryId === '*'
                ? item.countryAssignment || getCountryItemAssignment(countryScope, item.sourceId, item.itemId)
                : null;
            if (category.categoryId === '*' && (
                item.sourceId !== category.sourceId ||
                !(countryAssignment || isAllowedWildcardItem(allowedItems, item.sourceId, item.itemId, type))
            )) continue;
            if (!item.normalizedName.includes(normalizedQuery)) continue;
            const itemKey = `${item.sourceId}\u001f${item.itemId}`;
            if (seenItems.has(itemKey)) continue;
            seenItems.add(itemKey);
            const globalStreamId = encodeGlobalId(item.sourceId, item.itemId);
            results.push({
                id: `cache:${type}:${globalStreamId}`,
                sourceId: item.sourceId,
                itemId: item.itemId,
                globalStreamId,
                name: item.name,
                streamIcon: item.streamIcon,
                containerExtension: item.containerExtension,
                categoryId: item.categoryId,
                packageId: countryAssignment?.packageId || category.packageId,
                packageName: countryAssignment?.packageName || category.packageName,
                priority: countryAssignment?.priority ?? category.priority
            });
        }
    }
    results.sort((left, right) =>
        Number(right.priority) - Number(left.priority) ||
        left.name.localeCompare(right.name, 'fr')
    );
    return { available: true, results: results.slice(0, limit) };
}

async function searchSource(sourceId, type, categoryMap, normalizedQuery, allowedItems, countryScope = null) {
    const source = await sources.getById(sourceId);
    if (!source || !source.enabled || source.type !== 'xtream') {
        throw new Error(`Xtream source ${sourceId} is unavailable.`);
    }

    // This intentionally calls the provider API directly. It does not read the
    // browser catalogue, SQLite catalogue, JSON snapshots, or Nodecast cache.
    const api = xtreamApi.createFromSource(source);
    const items = type === 'live'
        ? await api.getLiveStreams()
        : type === 'movie'
            ? await api.getVodStreams()
            : await api.getSeries();

    if (!Array.isArray(items)) return [];

    const results = [];
    for (const item of items) {
        const itemId = getItemId(item, type);
        if (itemId === undefined || itemId === null) continue;
        const name = cleanText(item.name || item.title || item.series_name, 500);
        if (!name || !normalizeText(name).includes(normalizedQuery)) continue;

        let category = resolveSearchCategory(item, categoryMap, sourceId, type, allowedItems);
        const countryAssignment = getCountryItemAssignment(countryScope, sourceId, itemId);
        if (!category && countryAssignment && categoryMap.has('*')) {
            category = { ...categoryMap.get('*'), ...countryAssignment };
        }
        if (!category) continue;

        const globalStreamId = encodeGlobalId(sourceId, itemId);
        results.push({
            id: `api:${type}:${globalStreamId}`,
            sourceId,
            itemId: String(itemId),
            globalStreamId,
            name,
            streamIcon: cleanText(item.stream_icon || item.cover, 2000),
            containerExtension: cleanText(item.container_extension, 32),
            categoryId: String(item.category_id ?? category.categoryId),
            packageId: category.packageId,
            packageName: category.packageName,
            priority: category.priority
        });
    }
    return results;
}

async function searchOnRemoteServer(req, payload) {
    if (!REMOTE_SEARCH_BASE) return null;

    const target = new URL('/api/search', REMOTE_SEARCH_BASE);
    const requestHost = String(req.get('host') || '').toLowerCase();
    if (target.host.toLowerCase() === requestHost) return null;

    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
    for (const name of ['authorization', 'x-admin-access-key', 'x-velora-admin-key']) {
        const value = req.get(name);
        if (value) headers[name] = value;
    }

    const response = await fetch(target, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        cache: 'no-store'
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) {
        throw new Error(`Remote search API returned ${response.status}.`);
    }
    return body;
}

router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    try {
        const query = cleanText(req.body && req.body.query, 100);
        const type = cleanText(req.body && req.body.type, 16);
        let categories = normalizeCategories(req.body && req.body.categories);
        const countryId = cleanText(req.body && req.body.countryId, 240);
        const allowedItems = normalizeAllowedItems(req.body && req.body.allowedItems);
        const requestedLimit = Number.parseInt(req.body && req.body.limit, 10);
        const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : MAX_RESULTS, 1), MAX_RESULTS);

        if (query.length < 2) {
            return res.status(400).json({ error: 'Search query must contain at least 2 characters.' });
        }
        if (!['live', 'movie', 'series'].includes(type)) {
            return res.status(400).json({ error: 'Search type must be live, movie, or series.' });
        }
        const countryScope = getCountrySearchScope(countryId, type);
        if (countryScope) {
            categories = (veloraCatalogCache.getStatus().sourceIds || []).map(sourceId => ({
                sourceId: Number(sourceId),
                categoryId: '*',
                packageId: '__velora_country_memberships__',
                packageName: '',
                priority: false
            })).filter(category => Number.isInteger(category.sourceId));
            if (!categories.length) {
                return res.status(503).json({
                    error: 'VPS search cache is not ready.',
                    query,
                    type,
                    source: 'vps-search-cache',
                    results: []
                });
            }
        }
        if (!categories.length) {
            return res.json({ query, type, source: 'provider-api', results: [] });
        }

        const categoriesBySource = new Map();
        for (const category of categories) {
            let categoryMap = categoriesBySource.get(category.sourceId);
            if (!categoryMap) {
                categoryMap = new Map();
                categoriesBySource.set(category.sourceId, categoryMap);
            }
            categoryMap.set(category.categoryId, category);
        }

        const normalizedQuery = normalizeText(query);
        const cachedSearch = await searchSnapshot(
            categories,
            type,
            normalizedQuery,
            limit,
            allowedItems,
            countryScope
        );
        if (cachedSearch.available) {
            return res.json({
                query,
                type,
                source: 'vps-search-cache',
                snapshotVersion: indexedSnapshotVersion,
                results: cachedSearch.results
            });
        }

        if (countryScope) {
            return res.status(503).json({
                error: 'VPS search cache is not ready.',
                query,
                type,
                source: 'vps-search-cache',
                results: []
            });
        }

        const settled = await Promise.allSettled(
            [...categoriesBySource].map(([sourceId, categoryMap]) =>
                searchSource(sourceId, type, categoryMap, normalizedQuery, allowedItems, countryScope)
            )
        );

        const results = settled
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => result.value)
            .sort((left, right) =>
                Number(right.priority) - Number(left.priority) ||
                left.name.localeCompare(right.name, 'fr')
            )
            .slice(0, limit);
        const errors = settled
            .filter(result => result.status === 'rejected')
            .map(result => result.reason instanceof Error ? result.reason.message : String(result.reason));

        if (!results.length && errors.length === settled.length) {
            try {
                const remoteResult = await searchOnRemoteServer(req, {
                    query,
                    type,
                    countryId,
                    categories,
                    allowedItems: [...allowedItems],
                    limit
                });
                if (remoteResult) return res.json(remoteResult);
            } catch (remoteError) {
                errors.push(remoteError instanceof Error ? remoteError.message : String(remoteError));
            }
            console.warn('[Search] Provider API unavailable:', errors.join(' | '));
            return res.status(502).json({
                error: 'Search provider unavailable.',
                details: errors
            });
        }

        res.json({ query, type, source: 'provider-api', results, partial: errors.length > 0 });
    } catch (err) {
        console.error('Search API error:', err);
        res.status(500).json({ error: 'Search API unavailable.' });
    }
});

module.exports = router;
module.exports._test = {
    normalizeCategories,
    normalizeAllowedItems,
    getCountrySearchScope,
    getCountryItemAssignment,
    resolveSearchCategory,
    searchSnapshot
};
