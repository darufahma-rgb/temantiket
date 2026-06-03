'use strict';

const session = require('express-session');
const ConnectPgSimple = require('connect-pg-simple');
const { getPool, queryOne } = require('./pgDb.cjs');

function setupAuth(app) {
  const PgSession = ConnectPgSimple(session);
  app.use(session({
    store: new PgSession({
      pool: getPool(),
      tableName: 'sessions',
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET || 'temantiket-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    },
  }));
}

function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = { id: req.session.userId, email: req.session.userEmail || null };
    return next();
  }
  return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
}

async function isAuthenticatedOrBearer(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = { id: req.session.userId, email: req.session.userEmail || null };
    return next();
  }
  return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
}

function registerAuthRoutes(app) {
  app.get('/api/auth/user', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.id;
      const member = await queryOne(
        `SELECT am.agency_id, am.role, am.commission_pct, a.name AS agency_name
         FROM agency_members am
         JOIN agencies a ON a.id = am.agency_id
         WHERE am.user_id = $1
         LIMIT 1`,
        [userId]
      );

      const u = await queryOne('SELECT * FROM users WHERE id = $1', [userId]);

      return res.json({
        id:              userId,
        email:           u?.email || req.user.email || req.session.userEmail || '',
        firstName:       u?.first_name || null,
        lastName:        u?.last_name || null,
        displayName:     u ? ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.email?.split('@')[0] || 'User') : (req.session.userEmail?.split('@')[0] || 'User'),
        profileImageUrl: u?.profile_image_url || null,
        role:            member?.role ?? null,
        agencyId:        member?.agency_id ?? null,
        agencyName:      member?.agency_name ?? null,
        commissionPct:   Number(member?.commission_pct ?? 0),
      });
    } catch (e) {
      console.error('[auth/user]', e);
      return res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { userId, email, firstName, lastName, profileImageUrl } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });

    try {
      await queryOne(
        `INSERT INTO users (id, email, first_name, last_name, profile_image_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           profile_image_url = EXCLUDED.profile_image_url,
           updated_at = NOW()`,
        [userId, email || null, firstName || null, lastName || null, profileImageUrl || null]
      );
    } catch (e) {
      console.warn('[auth/login] upsert user error:', e.message);
    }

    req.session.userId = userId;
    req.session.userEmail = email || null;
    return res.json({ ok: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
}

module.exports = { setupAuth, isAuthenticated, isAuthenticatedOrBearer, registerAuthRoutes };
