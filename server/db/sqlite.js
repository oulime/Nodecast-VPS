const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = process.env.CONTENT_DB_PATH
    ? path.resolve(process.env.CONTENT_DB_PATH)
    : path.join(dataDir, 'content.db');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function getDb() {
    if (!db) {
        console.log('[SQLite] Opening database at', dbPath);
        db = new Database(dbPath);
        // Optimize performance
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        initSchema();
    }
    return db;
}

function initSchema() {
    if (!db) throw new Error('Database not initialized');

    // Categories (Groups)
    db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY, -- Composite key: sourceId:categoryId
            source_id INTEGER NOT NULL,
            category_id TEXT NOT NULL,
            type TEXT NOT NULL, -- 'live', 'movie', 'series'
            name TEXT NOT NULL,
            parent_id TEXT, -- For nested categories
            is_hidden INTEGER DEFAULT 0,
            data JSON -- Extra provider data
        );
        CREATE INDEX IF NOT EXISTS idx_categories_source_type ON categories(source_id, type);
    `);

    // Playlist Items (Channels, Movies, Series, Episodes)
    db.exec(`
        CREATE TABLE IF NOT EXISTS playlist_items (
            id TEXT PRIMARY KEY, -- Composite key: sourceId:itemId
            source_id INTEGER NOT NULL,
            item_id TEXT NOT NULL, -- Original ID from provider
            type TEXT NOT NULL, -- 'live', 'movie', 'series', 'episode'
            name TEXT NOT NULL,
            category_id TEXT, -- maps to categories.category_id (not our composite id)
            parent_id TEXT, -- For episodes -> series_id
            
            -- Common Media Fields
            stream_icon TEXT,
            stream_url TEXT, -- Direct link if available
            container_extension TEXT,
            
            -- VOD/Series Specific
            rating REAL,
            year TEXT,
            added_at TEXT,
            
            -- App State
            is_hidden INTEGER DEFAULT 0,
            is_favorite INTEGER DEFAULT 0,
            
            data JSON -- Full original JSON object
        );
        CREATE INDEX IF NOT EXISTS idx_items_source_type ON playlist_items(source_id, type);
        CREATE INDEX IF NOT EXISTS idx_items_category ON playlist_items(source_id, category_id);
    `);

    // EPG Programs
    // Optimized for range queries
    db.exec(`
        CREATE TABLE IF NOT EXISTS epg_programs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT NOT NULL, -- matches playlist_items.id if possible, or mapping key
            source_id INTEGER NOT NULL,
            start_time INTEGER NOT NULL, -- Unix timestamp (ms)
            end_time INTEGER NOT NULL,   -- Unix timestamp (ms)
            title TEXT,
            description TEXT,
            data JSON
        );
        CREATE INDEX IF NOT EXISTS idx_epg_channel_time ON epg_programs(channel_id, start_time, end_time);
        CREATE INDEX IF NOT EXISTS idx_epg_cleanup ON epg_programs(end_time); -- For deleting old programs
    `);

    // Sync Status
    db.exec(`
        CREATE TABLE IF NOT EXISTS sync_status (
            source_id INTEGER NOT NULL,
            type TEXT NOT NULL, -- 'live', 'vod', 'series', 'epg'
            last_sync INTEGER NOT NULL,
            status TEXT, -- 'success', 'error', 'syncing'
            error TEXT,
            PRIMARY KEY (source_id, type)
        );
    `);

    // Velora admin/package configuration. Rows are stored as JSON so the local
    // API can preserve the existing PostgREST-shaped frontend contract while
    // keeping the source of truth entirely on this VPS.
    db.exec(`
        CREATE TABLE IF NOT EXISTS velora_admin_rows (
            table_name TEXT NOT NULL,
            row_id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (table_name, row_id)
        );
        CREATE INDEX IF NOT EXISTS idx_velora_admin_rows_table
            ON velora_admin_rows(table_name);
    `);

    const veloraCount = db.prepare(
        `SELECT COUNT(*) AS count FROM velora_admin_rows WHERE table_name = ?`
    ).get('admin_countries').count;
    if (veloraCount < 3) {
        const insertVeloraRow = db.prepare(`
            INSERT OR IGNORE INTO velora_admin_rows (table_name, row_id, data)
            VALUES (?, ?, ?)
        `);
        const baseCountries = [
            'Afghanistan', 'Afrique du Sud', 'Albanie', 'Algérie', 'Allemagne',
            'Angleterre', 'Arabie saoudite', 'Arabe', 'Argentine', 'Arménie',
            'Australie', 'Autres', 'Autriche', 'Azerbaïdjan', 'Bahreïn',
            'Bangladesh', 'Belgique', 'Biélorussie', 'Bolivie', 'Bosnie-Herzégovine',
            'Brésil', 'Bulgarie', 'Cameroun', 'Canada', 'Chili', 'Chine',
            'Chypre', 'Colombie', 'Congo / Gabon', 'Corée du Sud', 'Costa Rica',
            'Croatie', 'Danemark', 'Écosse', 'Égypte', 'Émirats arabes unis',
            'Équateur', 'Espagne', 'États-Unis', 'Finlande', 'France', 'Géorgie',
            'Ghana', 'Grèce', 'Guatemala', 'Honduras', 'Hong Kong', 'Hongrie',
            'Inde', 'Indonésie', 'Irak', 'Iran', 'Irlande', 'Islande', 'Israël',
            'Italie', 'Japon', 'Jordanie', 'Kazakhstan', 'Kosovo', 'Koweït',
            'Kurdistan', 'Lettonie', 'Liban', 'Libye', 'Lituanie', 'Luxembourg',
            'Macédoine du Nord', 'Malaisie', 'Mali', 'Malte', 'Maroc',
            'Maurice', 'Mauritanie', 'Mexique', 'Monténégro', 'Népal',
            'Nicaragua', 'Nigeria', 'Norvège', 'Nouvelle-Zélande', 'Oman',
            'Ouzbékistan', 'Pakistan', 'Palestine', 'Panama', 'Paraguay',
            'Pays-Bas', 'Pays de Galles', 'Pérou', 'Philippines', 'Pologne',
            'Portugal', 'Qatar', 'République dominicaine', 'République tchèque',
            'Roumanie', 'Royaume-Uni', 'Russie', 'Salvador', 'Sénégal',
            'Serbie', 'Slovaquie', 'Slovénie', 'Somalie', 'Soudan', 'Sri Lanka',
            'Suède', 'Suisse', 'Suriname', 'Syrie', 'Taïwan', 'Thaïlande',
            'Tunisie', 'Turquie', 'Ukraine', 'Uruguay', 'USA', 'Venezuela',
            'Vietnam', 'Yémen'
        ];
        const countryKey = name => name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        const seed = db.transaction(() => {
            for (const name of baseCountries) {
                const key = countryKey(name);
                const countryId = `country_${key}`;
                const canonicalId = `canonical_${key}`;
                insertVeloraRow.run('admin_countries', countryId, JSON.stringify({
                    id: countryId,
                    name
                }));
                insertVeloraRow.run('canonical_countries', canonicalId, JSON.stringify({
                    id: canonicalId,
                    match_key: `__manual__:${key}`,
                    display_name: name,
                    sort_order: name === 'France' ? 0 : 100
                }));
                if (name === 'France' || name === 'Autres') {
                    const visibleId = `visible_${key}`;
                    insertVeloraRow.run('canonical_countries', visibleId, JSON.stringify({
                        id: visibleId,
                        match_key: `__visible__:${key}`,
                        display_name: name,
                        sort_order: 999999
                    }));
                }
            }
        });
        seed();
        console.log(`[SQLite] Seeded clean Velora configuration with ${baseCountries.length} countries`);
    }

    // User Favorites (per-user)
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT,
            role TEXT NOT NULL DEFAULT 'viewer',
            display_name TEXT,
            subscription_start TEXT,
            subscription_end TEXT,
            subscription_plan_months INTEGER,
            subscription_blocked INTEGER NOT NULL DEFAULT 0,
            oidc_id TEXT UNIQUE,
            email TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        CREATE INDEX IF NOT EXISTS idx_users_subscription_end ON users(subscription_end);

        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            source_id INTEGER NOT NULL,
            item_id TEXT NOT NULL,
            item_type TEXT NOT NULL, -- 'channel', 'movie', 'series'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, source_id, item_id, item_type)
        );
        CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
        CREATE INDEX IF NOT EXISTS idx_favorites_user_type ON favorites(user_id, item_type);
    `);

    // One-time compatibility import from the former JSON user store. Existing
    // IDs and password hashes are preserved so issued JWTs keep working.
    const legacyDbPath = path.join(dataDir, 'db.json');
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    if (userCount === 0 && fs.existsSync(legacyDbPath)) {
        try {
            const legacyUsers = JSON.parse(fs.readFileSync(legacyDbPath, 'utf8')).users || [];
            const insertUser = db.prepare(`
                INSERT OR IGNORE INTO users (
                    id, username, password_hash, role, display_name,
                    subscription_start, subscription_end, subscription_plan_months,
                    subscription_blocked, oidc_id, email, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const importUsers = db.transaction(() => {
                for (const user of legacyUsers) {
                    if (!user?.username) continue;
                    insertUser.run(
                        user.id || null,
                        user.username,
                        user.passwordHash || null,
                        user.role || 'viewer',
                        user.displayName || null,
                        user.subscriptionStart || null,
                        user.subscriptionEnd || null,
                        user.subscriptionPlanMonths || null,
                        user.subscriptionBlocked ? 1 : 0,
                        user.oidcId || null,
                        user.email || null,
                        user.createdAt || new Date().toISOString(),
                        user.updatedAt || new Date().toISOString()
                    );
                }
            });
            importUsers();
            if (legacyUsers.length) console.log(`[SQLite] Imported ${legacyUsers.length} legacy user(s)`);
        } catch (err) {
            console.error('[SQLite] Failed to import legacy users:', err.message);
        }
    }

    // Watch History (per-user)
    db.exec(`
        CREATE TABLE IF NOT EXISTS watch_history (
            id TEXT PRIMARY KEY, -- Composite key: user_id:item_id
            user_id INTEGER NOT NULL,
            source_id INTEGER, -- Source ID for Xtream/M3U
            item_type TEXT NOT NULL, -- 'movie', 'episode'
            item_id TEXT NOT NULL, -- The original item ID (stream_id or composite)
            parent_id TEXT, -- For episodes (series ID)
            progress INTEGER DEFAULT 0, -- Current position in seconds
            duration INTEGER DEFAULT 0, -- Total duration in seconds
            updated_at INTEGER NOT NULL, -- Timestamp
            data JSON -- Snapshot of item data (title, poster, etc)
        );
        CREATE INDEX IF NOT EXISTS idx_history_user_updated ON watch_history(user_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_history_user_item ON watch_history(user_id, item_id);
    `);

    // Migration: Add source_id column if missing (for existing databases)
    try {
        db.exec(`ALTER TABLE watch_history ADD COLUMN source_id INTEGER`);
        console.log('[SQLite] Added source_id column to watch_history');
    } catch (e) {
        // Column already exists, ignore
    }

    console.log('[SQLite] Schema initialized');
}

// ============================================================
// Favorites CRUD Operations
// ============================================================
const favorites = {
    getAll(userId, sourceId = null, itemType = null) {
        const db = getDb();
        let sql = 'SELECT * FROM favorites WHERE user_id = ?';
        const params = [userId];

        if (sourceId) {
            sql += ' AND source_id = ?';
            params.push(sourceId);
        }
        if (itemType) {
            sql += ' AND item_type = ?';
            params.push(itemType);
        }

        sql += ' ORDER BY created_at DESC';
        return db.prepare(sql).all(...params);
    },

    add(userId, sourceId, itemId, itemType = 'channel') {
        const db = getDb();
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO favorites (user_id, source_id, item_id, item_type)
            VALUES (?, ?, ?, ?)
        `);
        const result = stmt.run(userId, sourceId, itemId, itemType);
        return result.changes > 0;
    },

    remove(userId, sourceId, itemId, itemType = 'channel') {
        const db = getDb();
        const stmt = db.prepare(`
            DELETE FROM favorites 
            WHERE user_id = ? AND source_id = ? AND item_id = ? AND item_type = ?
        `);
        const result = stmt.run(userId, sourceId, itemId, itemType);
        return result.changes > 0;
    },

    isFavorite(userId, sourceId, itemId, itemType = 'channel') {
        const db = getDb();
        const row = db.prepare(`
            SELECT 1 FROM favorites 
            WHERE user_id = ? AND source_id = ? AND item_id = ? AND item_type = ?
        `).get(userId, sourceId, itemId, itemType);
        return !!row;
    },

    // Get all favorites for a user, grouped by type (for bulk checks)
    getAllAsSet(userId) {
        const db = getDb();
        const rows = db.prepare('SELECT source_id, item_id, item_type FROM favorites WHERE user_id = ?').all(userId);
        const set = new Set();
        for (const row of rows) {
            set.add(`${row.source_id}:${row.item_id}:${row.item_type}`);
        }
        return set;
    }
};

module.exports = {
    getDb,
    initSchema,
    favorites
};
