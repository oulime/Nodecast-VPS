const db = require('../db');

const TABLE = process.env.SUPABASE_PAID_USERS_TABLE || 'paid_users';

function supabaseUrl() {
    return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
}

function supabaseKey() {
    return (
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SUPABASE_SECRET_KEY ||
        ''
    ).trim();
}

function isSupabaseEnabled() {
    return Boolean(supabaseUrl() && supabaseKey());
}

function apiBase() {
    const url = supabaseUrl();
    if (!url) throw new Error('SUPABASE_URL is missing');
    return `${url}/rest/v1/${TABLE}`;
}

function headers(extra = {}) {
    const key = supabaseKey();
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
    return {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...extra
    };
}

function qs(value) {
    return encodeURIComponent(String(value));
}

function toCamel(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash || row.passwordHash || null,
        role: row.role || 'viewer',
        displayName: row.display_name ?? row.displayName ?? null,
        subscriptionStart: row.subscription_start ?? row.subscriptionStart ?? null,
        subscriptionEnd: row.subscription_end ?? row.subscriptionEnd ?? null,
        subscriptionPlanMonths: row.subscription_plan_months ?? row.subscriptionPlanMonths ?? null,
        subscriptionBlocked: Boolean(row.subscription_blocked ?? row.subscriptionBlocked),
        oidcId: row.oidc_id ?? row.oidcId ?? null,
        email: row.email ?? null,
        createdAt: row.created_at ?? row.createdAt ?? null,
        updatedAt: row.updated_at ?? row.updatedAt ?? null
    };
}

function toSnake(user) {
    const row = {};
    if (Object.prototype.hasOwnProperty.call(user, 'username')) row.username = user.username;
    if (Object.prototype.hasOwnProperty.call(user, 'passwordHash')) row.password_hash = user.passwordHash;
    if (Object.prototype.hasOwnProperty.call(user, 'role')) row.role = user.role;
    if (Object.prototype.hasOwnProperty.call(user, 'displayName')) row.display_name = user.displayName;
    if (Object.prototype.hasOwnProperty.call(user, 'subscriptionStart')) row.subscription_start = user.subscriptionStart;
    if (Object.prototype.hasOwnProperty.call(user, 'subscriptionEnd')) row.subscription_end = user.subscriptionEnd;
    if (Object.prototype.hasOwnProperty.call(user, 'subscriptionPlanMonths')) row.subscription_plan_months = user.subscriptionPlanMonths;
    if (Object.prototype.hasOwnProperty.call(user, 'subscriptionBlocked')) row.subscription_blocked = Boolean(user.subscriptionBlocked);
    if (Object.prototype.hasOwnProperty.call(user, 'oidcId')) row.oidc_id = user.oidcId;
    if (Object.prototype.hasOwnProperty.call(user, 'email')) row.email = user.email;
    if (Object.prototype.hasOwnProperty.call(user, 'createdAt')) row.created_at = user.createdAt;
    if (Object.prototype.hasOwnProperty.call(user, 'updatedAt')) row.updated_at = user.updatedAt;
    return row;
}

async function request(path = '', options = {}) {
    const res = await fetch(`${apiBase()}${path}`, {
        ...options,
        headers: headers(options.headers || {})
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
        const message = body?.message || body?.error_description || body?.hint || body?.details || `Supabase HTTP ${res.status}`;
        throw new Error(message);
    }
    return body;
}

async function getAllSupabase() {
    const rows = await request('?select=*&order=created_at.desc');
    return Array.isArray(rows) ? rows.map(toCamel) : [];
}

async function getByIdSupabase(id) {
    const rows = await request(`?id=eq.${qs(id)}&select=*&limit=1`);
    return toCamel(Array.isArray(rows) ? rows[0] : null);
}

async function getByUsernameSupabase(username) {
    const rows = await request(`?username=eq.${qs(username)}&select=*&limit=1`);
    return toCamel(Array.isArray(rows) ? rows[0] : null);
}

async function createSupabase(userData) {
    const row = toSnake({ ...userData, role: userData.role || 'viewer' });
    const rows = await request('', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(row)
    });
    return toCamel(Array.isArray(rows) ? rows[0] : rows);
}

async function updateSupabase(id, updates) {
    const row = toSnake({ ...updates, updatedAt: new Date().toISOString() });
    const rows = await request(`?id=eq.${qs(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(row)
    });
    return toCamel(Array.isArray(rows) ? rows[0] : rows);
}

async function deleteSupabase(id) {
    await request(`?id=eq.${qs(id)}`, { method: 'DELETE' });
    return true;
}

function withoutPassword(user) {
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
}

async function getLocalPaidUsers() {
    const users = await db.users.getAll();
    return users.filter((user) => user.role !== 'admin');
}

const paidUsersStore = {
    isSupabaseEnabled,

    config() {
        return {
            mode: isSupabaseEnabled() ? 'supabase' : 'local',
            table: TABLE,
            urlConfigured: Boolean(supabaseUrl()),
            serviceKeyConfigured: Boolean(supabaseKey())
        };
    },

    async getAll() {
        if (isSupabaseEnabled()) return getAllSupabase();
        return getLocalPaidUsers();
    },

    async getById(id) {
        if (isSupabaseEnabled()) return getByIdSupabase(id);
        const user = await db.users.getById(id);
        return user && user.role !== 'admin' ? user : null;
    },

    async getByUsername(username) {
        if (isSupabaseEnabled()) return getByUsernameSupabase(username);
        const user = await db.users.getByUsername(username);
        return user && user.role !== 'admin' ? user : null;
    },

    async create(userData) {
        if (isSupabaseEnabled()) return withoutPassword(await createSupabase(userData));
        return db.users.create(userData);
    },

    async update(id, updates) {
        if (isSupabaseEnabled()) return withoutPassword(await updateSupabase(id, updates));
        return db.users.update(id, updates);
    },

    async delete(id) {
        if (isSupabaseEnabled()) return deleteSupabase(id);
        return db.users.delete(id);
    },

    async importLocalPaidUsers({ overwrite = false } = {}) {
        if (!isSupabaseEnabled()) throw new Error('Supabase is not configured on this server');
        const localUsers = await getLocalPaidUsers();
        const result = { source: 'data/db.json', table: TABLE, total: localUsers.length, created: 0, updated: 0, skipped: 0, errors: [] };
        for (const localUser of localUsers) {
            try {
                const existing = await getByUsernameSupabase(localUser.username);
                const payload = {
                    username: localUser.username,
                    passwordHash: localUser.passwordHash || null,
                    role: 'viewer',
                    displayName: localUser.displayName || null,
                    subscriptionStart: localUser.subscriptionStart || null,
                    subscriptionEnd: localUser.subscriptionEnd || null,
                    subscriptionPlanMonths: localUser.subscriptionPlanMonths || null,
                    subscriptionBlocked: Boolean(localUser.subscriptionBlocked),
                    oidcId: localUser.oidcId || null,
                    email: localUser.email || null,
                    createdAt: localUser.createdAt || new Date().toISOString(),
                    updatedAt: localUser.updatedAt || null
                };
                if (existing) {
                    if (!overwrite) {
                        result.skipped += 1;
                        continue;
                    }
                    await updateSupabase(existing.id, payload);
                    result.updated += 1;
                } else {
                    await createSupabase(payload);
                    result.created += 1;
                }
            } catch (err) {
                result.errors.push({ username: localUser.username, error: err?.message || String(err) });
            }
        }
        return result;
    }
};

module.exports = paidUsersStore;
