const express = require('express');
const { sources } = require('../db');
const xtreamApi = require('../services/xtreamApi');

const router = express.Router();
const MAX_CATEGORIES = 200;
const MAX_RESULTS = 150;
const DEFAULT_REMOTE_SEARCH_BASE = 'https://nodecast.veloravip.net';
const REMOTE_SEARCH_BASE = String(
    process.env.VELORA_SEARCH_REMOTE_BASE ||
    process.env.VELORA_CATALOG_REMOTE_BASE ||
    DEFAULT_REMOTE_SEARCH_BASE
).trim().replace(/\/+$/, '');

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
        categories.push({ sourceId, categoryId, packageId, packageName });
        if (categories.length >= MAX_CATEGORIES) break;
    }
    return categories;
}

function getItemId(item, type) {
    return type === 'series' ? item.series_id : item.stream_id;
}

function getItemCategoryIds(item) {
    const values = Array.isArray(item.category_ids) ? item.category_ids : [item.category_id];
    return values.map(value => String(value ?? '').trim()).filter(Boolean);
}

async function searchSource(sourceId, type, categoryMap, normalizedQuery) {
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

        const category = getItemCategoryIds(item)
            .map(categoryId => categoryMap.get(categoryId))
            .find(Boolean);
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
            packageName: category.packageName
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
        const categories = normalizeCategories(req.body && req.body.categories);
        const requestedLimit = Number.parseInt(req.body && req.body.limit, 10);
        const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : MAX_RESULTS, 1), MAX_RESULTS);

        if (query.length < 2) {
            return res.status(400).json({ error: 'Search query must contain at least 2 characters.' });
        }
        if (!['live', 'movie', 'series'].includes(type)) {
            return res.status(400).json({ error: 'Search type must be live, movie, or series.' });
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
        const settled = await Promise.allSettled(
            [...categoriesBySource].map(([sourceId, categoryMap]) =>
                searchSource(sourceId, type, categoryMap, normalizedQuery)
            )
        );

        const results = settled
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => result.value)
            .sort((left, right) => left.name.localeCompare(right.name, 'fr'))
            .slice(0, limit);
        const errors = settled
            .filter(result => result.status === 'rejected')
            .map(result => result.reason instanceof Error ? result.reason.message : String(result.reason));

        if (!results.length && errors.length === settled.length) {
            try {
                const remoteResult = await searchOnRemoteServer(req, {
                    query,
                    type,
                    categories,
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
