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
const vodPosterCachePath = path.join(__dirname, '..', '..', 'data', 'vod-poster-cache.json');

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
    const categoryItems = db.prepare(`
        SELECT item_id FROM playlist_items
        WHERE source_id = ? AND type = ? AND category_id = ? AND is_hidden = 0
    `);

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
        const candidates = categories.filter(category => {
            const kind = category.type === 'movie' ? 'vod' : category.type;
            return normalizedPackageName(category.name) === normalizedPackageName(providerPackageName)
                && (!expectedKinds?.size || expectedKinds.has(kind));
        }).map(category => {
            const items = categoryItems.all(category.source_id, category.type, String(category.category_id));
            return {
                category,
                score: items.reduce(
                    (total, item) => total + (legacyIds.has(String(item.item_id)) ? 1 : 0), 0
                ),
                itemCount: items.length
            };
        }).sort((left, right) => right.score - left.score || right.itemCount - left.itemCount);

        const best = candidates[0];
        const runnerUp = candidates[1];
        if (!best || (candidates.length > 1 && best.score <= (runnerUp?.score || 0))) {
            return packageRow;
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

function catalogueItemType(kind) {
    if (kind === 'vod' || kind === 'movies') return 'movie';
    return kind === 'live' || kind === 'series' ? kind : null;
}

/**
 * Return explicit curations plus current catalogue members for provider-backed
 * packages. An explicit curation for the same country/item wins, so moving an
 * item to another package (or the hidden package) is still respected.
 */
function effectiveCurations(packageIds = null) {
    const db = getDb();
    const rawCurations = allRows('admin_stream_curations');
    const packages = resolvedAdminPackages(allRows('admin_packages'), rawCurations);
    const packageById = new Map(packages.map(row => [String(row.id), row]));
    const explicit = rawCurations.map(row => {
        const packageRow = packageById.get(String(row.target_package_id || '')) || {};
        return {
            ...row,
            source_id: row.source_id ?? packageRow.source_id ?? null,
            kind: row.kind || packageRow.kind || null
        };
    });
    const explicitKeys = new Set();
    for (const row of explicit) {
        const countryId = String(row.country_id || '');
        const streamId = String(row.stream_id || '');
        if (!countryId || !streamId) continue;
        if (row.source_id != null && row.kind) {
            explicitKeys.add(`${countryId}:${row.kind}:${row.source_id}:${streamId}`);
        } else {
            explicitKeys.add(`${countryId}:legacy:${streamId}`);
        }
    }

    const wanted = packageIds ? new Set([...packageIds].map(String)) : null;
    const sourceAwareExplicit = explicit.filter(row => row.source_id != null && row.kind);
    const effective = wanted
        ? sourceAwareExplicit.filter(row => wanted.has(String(row.target_package_id || '')))
        : [...sourceAwareExplicit];
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

function isEditableLivePackage(packageRow, countryId) {
    return packageRow
        && String(packageRow.country_id || '') === String(countryId || '')
        && packageRow.kind === 'live'
        && packageRow.is_parent !== true
        && packageRow.is_parent !== 'true';
}

function saveChannelCuration({ countryId, sourceId, streamId, targetPackageId }, packages, rawCurations) {
    const packageById = new Map(packages.map(row => [String(row.id), row]));
    const matching = rawCurations.filter(row => {
        if (String(row.country_id || '') !== countryId || String(row.stream_id || '') !== streamId) return false;
        const currentPackage = packageById.get(String(row.target_package_id || '')) || {};
        const rowSourceId = Number.parseInt(row.source_id ?? currentPackage.source_id, 10);
        const rowKind = String(row.kind || currentPackage.kind || '');
        return rowSourceId === sourceId && rowKind === 'live';
    });
    const existing = matching.find(row => Number.parseInt(row.source_id, 10) === sourceId && row.kind === 'live')
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
        kind: 'live'
    };
    const db = getDb();
    db.transaction(() => {
        const remove = db.prepare(`
            DELETE FROM velora_admin_rows WHERE table_name = 'admin_stream_curations' AND row_id = ?
        `);
        for (const duplicate of matching) {
            if (String(duplicate.id) !== id) remove.run(String(duplicate.id));
        }
        db.prepare(`
            INSERT INTO velora_admin_rows (table_name, row_id, data, updated_at)
            VALUES ('admin_stream_curations', ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(table_name, row_id) DO UPDATE SET
                data = excluded.data,
                updated_at = CURRENT_TIMESTAMP
        `).run(id, JSON.stringify(row));
    })();
    return row;
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
        const rows = resolvedAdminPackages(
            allRows('admin_packages'),
            allRows('admin_stream_curations')
        );
        res.set('Cache-Control', 'no-store');
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
        const packages = resolvedAdminPackages(
            allRows('admin_packages'),
            allRows('admin_stream_curations')
        );
        const packageById = new Map(packages.map(row => [String(row.id), row]));
        const packageRow = packageById.get(packageId);
        if (!countryId || !packageId) return res.status(400).json({ error: 'countryId and packageId are required' });
        if (!isEditableLivePackage(packageRow, countryId)) {
            return res.status(400).json({ error: 'This package is not an editable live package in this country' });
        }
        const channels = liveChannelsForCurations(
            effectiveCurations(new Set([packageId])).filter(row =>
                String(row.country_id || '') === countryId
                && String(row.target_package_id || '') === packageId
            ),
            packageById
        );
        res.set('Cache-Control', 'no-store');
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
        const currentMembership = effectiveCurations(new Set([fromPackageId])).some(row =>
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
        const row = saveChannelCuration(
            { countryId, sourceId, streamId, targetPackageId },
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

router.get('/admin/stream-curation-map', (req, res) => {
    try {
        const rows = effectiveCurations().map(row => ({
            stream_id: row.stream_id,
            country_id: row.country_id,
            package_id: row.target_package_id,
            source_id: row.source_id,
            kind: row.kind
        }));
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
        const compactRows = [];
        for (const row of rows) {
            const streamId = Number(row.stream_id);
            if (!Number.isFinite(streamId) || !row.country_id || !row.package_id) continue;
            compactRows.push([
                indexFor(row.country_id, countries, countryIndexes),
                streamId,
                indexFor(row.package_id, packages, packageIndexes),
                row.source_id ?? null,
                row.kind || null
            ]);
        }
        res.set('Cache-Control', 'no-store');
        return res.json({ countries, packages, rows: compactRows });
    } catch (error) {
        console.error('[Velora data] Curation map failed:', error);
        return res.status(500).json({ error: error.message });
    }
});

function buildHomeCache() {
    const sections = sortRows(allRows('admin_home_sections'), 'section_order.asc');
    const sectionPackageIds = new Set(sections.map(section => String(section.package_id || '')));
    const curations = effectiveCurations(sectionPackageIds);
    const resolvedPackages = resolvedAdminPackages(
        allRows('admin_packages'),
        allRows('admin_stream_curations')
    );
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
            if (providerBacked) {
                return sourceId === providerSourceId
                    && String(item.raw_category_id ?? '') === providerCategoryId;
            }
            return membership.sourceAware
                ? membership.keys.has(`${sourceId}:${String(rawId)}`)
                : membership.keys.has(String(rawId));
        }).slice(0, 500).map(item => {
            const rawId = item.raw_stream_id ?? item.raw_series_id ?? item.stream_id ?? item.series_id;
            return {
                id: `home-cache:${section.id}:${rawId}`,
                name: String(item.name || item.title || item.series_name || '').trim(),
                thumbUrl: String(item.stream_icon || item.cover || ''),
                streamId: rawId,
                sourceId: item.source_id,
                globalStreamId: item.global_stream_id || item.stream_id,
                containerExtension: item.container_extension || '',
                contentType: type,
                packageId: section.package_id
            };
        }).filter(item => item.name);
        return { ...section, content_type: type, entries };
    });
    const payload = { generatedAt: new Date().toISOString(), sections: output };
    fs.mkdirSync(path.dirname(homeCachePath), { recursive: true });
    const temporaryPath = `${homeCachePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(payload));
    fs.renameSync(temporaryPath, homeCachePath);
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
        let payload;
        if (req.body && Array.isArray(req.body.sections)) {
            payload = {
                generatedAt: new Date().toISOString(),
                sections: req.body.sections.slice(0, 100).map(section => ({
                    ...section,
                    entries: Array.isArray(section.entries) ? section.entries.slice(0, 500) : []
                }))
            };
            await enrichHomeCacheMoviePosters(payload);
            fs.mkdirSync(path.dirname(homeCachePath), { recursive: true });
            const temporaryPath = `${homeCachePath}.${process.pid}.tmp`;
            fs.writeFileSync(temporaryPath, JSON.stringify(payload));
            fs.renameSync(temporaryPath, homeCachePath);
        } else {
            payload = buildHomeCache();
        }
        return res.json({ ok: true, generatedAt: payload.generatedAt, sections: payload.sections.length,
            entries: payload.sections.reduce((total, section) => total + section.entries.length, 0) });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.post('/admin/sync-packages', (req, res) => {
    try {
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
        const homeCache = buildHomeCache();
        return res.json({
            ok: true,
            packages: packageCount,
            items: itemCount,
            homeSections: homeCache.sections.length,
            homeEntries: homeCache.sections.reduce((total, section) => total + section.entries.length, 0),
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
            const values = Array.isArray(req.body) ? req.body : [req.body];
            const saved = getDb().transaction(() => values.map(value => saveRow(table, value, req)))();
            const representation = String(req.get('Prefer') || '').includes('return=representation');
            return representation ? res.status(201).json(saved) : res.status(201).end();
        }

        const rows = allRows(table).filter(row => matches(row, req.query));
        if (req.method === 'PATCH') {
            const saved = getDb().transaction(() =>
                rows.map(row => saveRow(table, { ...row, ...req.body }, req))
            )();
            const representation = String(req.get('Prefer') || '').includes('return=representation');
            return representation ? res.json(saved) : res.status(204).end();
        }

        if (req.method === 'DELETE') {
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
