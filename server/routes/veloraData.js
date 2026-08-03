const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/sqlite');
const veloraCatalogCache = require('../services/veloraCatalogCache');

const router = express.Router();
const homeCachePath = path.join(__dirname, '..', '..', 'data', 'velora-cache', 'home-sections.json');

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

router.get('/admin/stream-curation-map', (req, res) => {
    try {
        const rows = getDb().prepare(`
            SELECT
                json_extract(data, '$.stream_id') AS stream_id,
                json_extract(data, '$.country_id') AS country_id,
                json_extract(data, '$.target_package_id') AS package_id
            FROM velora_admin_rows
            WHERE table_name = 'admin_stream_curations'
        `).all();
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
                indexFor(row.package_id, packages, packageIndexes)
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
    const curations = allRows('admin_stream_curations');
    const packageStreams = new Map();
    for (const row of curations) {
        const packageId = String(row.target_package_id || '').trim();
        const streamId = String(row.stream_id || '').trim();
        if (!packageId || !streamId) continue;
        if (!packageStreams.has(packageId)) packageStreams.set(packageId, new Set());
        packageStreams.get(packageId).add(streamId);
    }
    const snapshots = {
        live: veloraCatalogCache.getSnapshot('live_streams') || [],
        movies: veloraCatalogCache.getSnapshot('vod_streams') || [],
        series: veloraCatalogCache.getSnapshot('series') || []
    };
    const output = sections.map(section => {
        const type = ['live', 'movies', 'series'].includes(section.content_type)
            ? section.content_type : 'live';
        const wanted = packageStreams.get(String(section.package_id)) || new Set();
        const entries = snapshots[type].filter(item => {
            const rawId = item.raw_stream_id ?? item.raw_series_id ?? item.stream_id ?? item.series_id;
            return wanted.has(String(rawId));
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
        res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
        return res.json(payload);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.post('/home-cache/rebuild', (req, res) => {
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

            const existingCurations = new Map(allRows('admin_stream_curations')
                .filter(row => String(row.country_id) === countryId)
                .map(row => [String(row.stream_id), row]));
            const upsert = db.prepare(`
                INSERT INTO velora_admin_rows (table_name, row_id, data)
                VALUES ('admin_stream_curations', ?, ?)
                ON CONFLICT(table_name, row_id) DO UPDATE SET
                    data = excluded.data,
                    updated_at = CURRENT_TIMESTAMP
            `);
            for (const streamId of itemIds) {
                const existing = existingCurations.get(streamId);
                const row = {
                    ...(existing || {}),
                    id: String(existing?.id || crypto.randomUUID()),
                    stream_id: streamId,
                    country_id: countryId,
                    target_package_id: target.id
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
