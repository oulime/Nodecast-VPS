const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../auth');
const paidUsersStore = require('../services/paidUsersStore');

async function findLoginUserByUsername(username) {
    const localUser = await db.users.getByUsername(username);
    if (localUser?.role === 'admin') return localUser;
    if (paidUsersStore.isSupabaseEnabled()) return paidUsersStore.getByUsername(username);
    return localUser || paidUsersStore.getByUsername(username);
}

async function findLoginUserById(id) {
    const localUser = await db.users.getById(id);
    if (localUser?.role === 'admin') return localUser;
    if (paidUsersStore.isSupabaseEnabled()) return paidUsersStore.getById(id);
    return localUser || paidUsersStore.getById(id);
}

// Configure Passport strategies
auth.configureLocalStrategy(
    findLoginUserByUsername,
    async (password, hash) => await auth.verifyPassword(password, hash)
);

auth.configureJwtStrategy(findLoginUserById);

// Configure Passport session serialization
auth.configureSessionSerialization(findLoginUserById);


const SUBSCRIPTION_PLAN_MONTHS = [1, 3, 6, 12, 24];

function sanitizeOptionalText(value, maxLength = 160) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : null;
}

function addMonths(date, months) {
    const next = new Date(date.getTime());
    const day = next.getDate();
    next.setMonth(next.getMonth() + months);
    if (next.getDate() !== day) next.setDate(0);
    return next;
}

function normalizePlanMonths(value) {
    const months = Number.parseInt(value, 10);
    if (!SUBSCRIPTION_PLAN_MONTHS.includes(months)) {
        throw new Error('Subscription period must be 1, 3, 6, 12, or 24 months');
    }
    return months;
}

function normalizeSubscriptionStart(value) {
    if (!value) return new Date();
    const start = new Date(value);
    if (Number.isNaN(start.getTime())) throw new Error('Invalid subscription start date');
    return start;
}

function subscriptionStatus(user) {
    if (!user || user.role === 'admin') return 'admin';
    if (user.subscriptionBlocked) return 'blocked';
    if (!user.subscriptionEnd) return 'trial';
    const end = new Date(user.subscriptionEnd);
    if (Number.isNaN(end.getTime())) return 'expired';
    return end.getTime() > Date.now() ? 'active' : 'expired';
}

function publicUser(user) {
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return {
        ...safe,
        displayName: safe.displayName || null,
        subscriptionStart: safe.subscriptionStart || null,
        subscriptionEnd: safe.subscriptionEnd || null,
        subscriptionPlanMonths: safe.subscriptionPlanMonths || null,
        subscriptionBlocked: Boolean(safe.subscriptionBlocked),
        subscriptionStatus: subscriptionStatus(safe)
    };
}

function buildSubscriptionFields(body, existing = null) {
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(body, 'displayName')) {
        updates.displayName = sanitizeOptionalText(body.displayName);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'subscriptionBlocked')) {
        updates.subscriptionBlocked = Boolean(body.subscriptionBlocked);
    }

    const planProvided = Object.prototype.hasOwnProperty.call(body, 'subscriptionPlanMonths') && body.subscriptionPlanMonths !== '' && body.subscriptionPlanMonths !== null;
    const startProvided = Object.prototype.hasOwnProperty.call(body, 'subscriptionStart') && body.subscriptionStart;
    const extendFromCurrent = body.extendFromCurrent === true;

    if (planProvided || startProvided) {
        const planMonths = planProvided
            ? normalizePlanMonths(body.subscriptionPlanMonths)
            : normalizePlanMonths(existing?.subscriptionPlanMonths || 1);
        const currentEnd = existing?.subscriptionEnd ? new Date(existing.subscriptionEnd) : null;
        const base = extendFromCurrent && currentEnd && currentEnd.getTime() > Date.now()
            ? currentEnd
            : normalizeSubscriptionStart(startProvided ? body.subscriptionStart : existing?.subscriptionStart);
        updates.subscriptionPlanMonths = planMonths;
        updates.subscriptionStart = base.toISOString();
        updates.subscriptionEnd = addMonths(base, planMonths).toISOString();
    }

    return updates;
}

/**
 * Check if initial setup is required
 * GET /api/auth/setup-required
 */
router.get('/setup-required', async (req, res) => {
    try {
        const userCount = await db.users.count();
        res.json({ setupRequired: userCount === 0 });
    } catch (err) {
        console.error('Error in /setup-required:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Initial setup - Create admin user
 * POST /api/auth/setup
 */
router.post('/setup', async (req, res) => {
    try {
        const userCount = await db.users.count();

        // Check if setup already done
        if (userCount > 0) {
            return res.status(400).json({ error: 'Setup already completed' });
        }

        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Create admin user
        const passwordHash = await auth.hashPassword(password);
        const adminUser = await db.users.create({
            username,
            passwordHash,
            role: 'admin'
        });

        // Generate token for immediate login
        const token = auth.generateToken(adminUser);

        res.status(201).json({
            message: 'Admin user created successfully',
            token,
            user: adminUser
        });
    } catch (err) {
        console.error('Error in /setup:', err);
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

/**
 * Login with Passport Local Strategy
 * POST /api/auth/login
 */
router.post('/login', (req, res, next) => {
    auth.passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).json({ error: 'Server error' });
        }

        if (!user) {
            return res.status(401).json({ error: info?.message || 'Invalid credentials' });
        }

        // Generate JWT token
        const token = auth.generateToken(user);

        res.json({
            token,
            user: publicUser(user)
        });
    })(req, res, next);
});

/**
 * Logout (client-side handles token removal)
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
    // With JWT, logout is handled client-side by removing the token
    // This endpoint exists for consistency and future server-side token blacklisting
    res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', auth.requireAuth, async (req, res) => {
    try {
        const user = await findLoginUserById(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(publicUser(user));
    } catch (err) {
        console.error('Error in /me:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Get all users (admin only)
 * GET /api/auth/users
 */
router.get('/users', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const allUsers = await db.users.getAll();

        res.json(allUsers.map(publicUser));
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Create a new user (admin only)
 * POST /api/auth/users
 */
router.post('/users', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const { username, password } = req.body;
        const role = req.body.role || 'viewer';

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        if (!['admin', 'viewer'].includes(role)) {
            return res.status(400).json({ error: 'Role must be either "admin" or "viewer"' });
        }

        const subscriptionFields = role === 'admin'
            ? {}
            : buildSubscriptionFields({
                ...req.body,
                subscriptionPlanMonths: req.body.subscriptionPlanMonths || 1,
                subscriptionStart: req.body.subscriptionStart || new Date().toISOString()
            });

        const passwordHash = await auth.hashPassword(password);
        const newUser = await db.users.create({
            username: username.trim(),
            passwordHash,
            role,
            ...subscriptionFields
        });

        res.status(201).json(publicUser(newUser));
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

/**
 * Update a user (admin only)
 * PUT /api/auth/users/:id
 */
router.put('/users/:id', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password, role } = req.body;
        const existingUser = await db.users.getById(id);
        if (!existingUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updates = {};

        if (username) {
            updates.username = username.trim();
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'displayName')) {
            updates.displayName = sanitizeOptionalText(req.body.displayName);
        }

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters' });
            }
            updates.passwordHash = await auth.hashPassword(password);
        }

        if (role) {
            if (!['admin', 'viewer'].includes(role)) {
                return res.status(400).json({ error: 'Role must be either "admin" or "viewer"' });
            }

            // Prevent removing admin role from the last admin
            if (existingUser.role === 'admin' && role !== 'admin') {
                const allUsers = await db.users.getAll();
                const adminCount = allUsers.filter(u => u.role === 'admin').length;
                if (adminCount <= 1) {
                    return res.status(400).json({ error: 'Cannot remove admin role from the last admin user' });
                }
            }

            updates.role = role;
        }

        Object.assign(updates, buildSubscriptionFields(req.body, existingUser));

        const updatedUser = await db.users.update(id, updates);
        res.json(publicUser(updatedUser));
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

/**
 * Delete a user (admin only)
 * DELETE /api/auth/users/:id
 */
router.delete('/users/:id', auth.requireAuth, auth.requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent deleting yourself
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await db.users.delete(id);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).json({ error: err.message || 'Server error' });
    }
});

module.exports = router;
