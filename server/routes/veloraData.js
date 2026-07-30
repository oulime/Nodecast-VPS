const crypto = require('crypto');
const express = require('express');
const { getDb } = require('../db/sqlite');

const router = express.Router();

const ALLOWED_TABLES = new Set([
    'admin_channel_name_prefixes',
    'admin_countries',
    'admin_country_package_order',
    'admin_global_package_allowlist',
    'admin_global_package_open_confirm',
    'admin_hidden_filters',
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
