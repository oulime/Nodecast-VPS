const { getDb } = require('../db/sqlite');

const COLUMN_MAP = {
    username: 'username',
    passwordHash: 'password_hash',
    role: 'role',
    displayName: 'display_name',
    subscriptionStart: 'subscription_start',
    subscriptionEnd: 'subscription_end',
    subscriptionPlanMonths: 'subscription_plan_months',
    subscriptionPlanMinutes: 'subscription_plan_minutes',
    subscriptionBlocked: 'subscription_blocked',
    oidcId: 'oidc_id',
    email: 'email'
};

function toUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        passwordHash: row.password_hash || null,
        role: row.role || 'viewer',
        displayName: row.display_name || null,
        subscriptionStart: row.subscription_start || null,
        subscriptionEnd: row.subscription_end || null,
        subscriptionPlanMonths: row.subscription_plan_months || null,
        subscriptionPlanMinutes: row.subscription_plan_minutes || null,
        subscriptionBlocked: Boolean(row.subscription_blocked),
        oidcId: row.oidc_id || null,
        email: row.email || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    };
}

function withoutPassword(user) {
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
}

function getById(id) {
    return toUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

const paidUsersStore = {
    config() {
        return {
            mode: 'sqlite',
            database: 'data/content.db',
            table: 'users'
        };
    },

    async getAll() {
        return getDb().prepare('SELECT * FROM users ORDER BY created_at DESC, id DESC').all().map(toUser);
    },

    async getById(id) {
        return getById(id);
    },

    async getByUsername(username) {
        return toUser(getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 1').get(String(username || '').trim()));
    },

    async create(userData) {
        const now = new Date().toISOString();
        const result = getDb().prepare(`
            INSERT INTO users (
                username, password_hash, role, display_name,
                subscription_start, subscription_end, subscription_plan_months, subscription_plan_minutes,
                subscription_blocked, oidc_id, email, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            String(userData.username || '').trim(),
            userData.passwordHash || null,
            userData.role || 'viewer',
            userData.displayName || null,
            userData.subscriptionStart || null,
            userData.subscriptionEnd || null,
            userData.subscriptionPlanMonths || null,
            userData.subscriptionPlanMinutes || null,
            userData.subscriptionBlocked ? 1 : 0,
            userData.oidcId || null,
            userData.email || null,
            userData.createdAt || now,
            now
        );
        return withoutPassword(getById(result.lastInsertRowid));
    },

    async update(id, updates) {
        const entries = Object.entries(updates).filter(([key]) => COLUMN_MAP[key]);
        if (!entries.length) return withoutPassword(getById(id));
        const assignments = entries.map(([key]) => `${COLUMN_MAP[key]} = ?`);
        const values = entries.map(([key, value]) => key === 'subscriptionBlocked' ? (value ? 1 : 0) : value);
        assignments.push('updated_at = ?');
        values.push(new Date().toISOString(), id);
        const result = getDb().prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
        if (!result.changes) throw new Error('User not found');
        return withoutPassword(getById(id));
    },

    async activateSubscription(id, subscriptionStart, subscriptionEnd) {
        const now = new Date().toISOString();
        const result = getDb().prepare(`
            UPDATE users
            SET subscription_start = ?, subscription_end = ?, updated_at = ?
            WHERE id = ? AND subscription_start IS NULL AND subscription_end IS NULL
        `).run(subscriptionStart, subscriptionEnd, now, id);
        return {
            activated: result.changes > 0,
            user: withoutPassword(getById(id))
        };
    },

    async delete(id) {
        const user = getById(id);
        if (!user) throw new Error('User not found');
        if (user.role === 'admin') {
            const admins = getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;
            if (admins <= 1) throw new Error('Cannot delete the last admin user');
        }
        getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
        return true;
    }
};

module.exports = paidUsersStore;
