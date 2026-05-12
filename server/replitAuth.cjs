'use strict';

/**
 * Replit Auth (OpenID Connect) — CommonJS adapter using openid-client v6
 * openid-client v6 removed the `Issuer` class; uses `discovery()` instead.
 */

const session         = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { pool }        = require('./db.cjs');

const {
  discovery,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  fetchUserInfo,
  randomState,
  randomNonce,
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
} = require('openid-client');

const PgSession = connectPgSimple(session);

// ── Cached OIDC configuration ────────────────────────────────────────────────

let _oidcConfig = null;

async function getOidcConfig() {
  if (_oidcConfig) return _oidcConfig;
  const clientId    = process.env.REPL_ID;
  const issuerUrl   = new URL('https://replit.com/oidc');
  _oidcConfig = await discovery(issuerUrl, clientId);
  return _oidcConfig;
}

// ── Storage helpers ──────────────────────────────────────────────────────────

async function upsertUser(claims) {
  const { sub, email, first_name, last_name, profile_image_url } = claims;
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, profile_image_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       email             = EXCLUDED.email,
       first_name        = EXCLUDED.first_name,
       last_name         = EXCLUDED.last_name,
       profile_image_url = EXCLUDED.profile_image_url,
       updated_at        = now()`,
    [sub, email ?? null, first_name ?? null, last_name ?? null, profile_image_url ?? null],
  );
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [sub]);
  return rows[0];
}

// ── setupAuth — call ONCE before registering routes ─────────────────────────

async function ensureSessionTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid"    varchar      NOT NULL COLLATE "default",
      "sess"   json         NOT NULL,
      "expire" timestamptz  NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
  `);
}

async function setupAuth(app) {
  app.set('trust proxy', 1);

  // Pre-create sessions table with IF NOT EXISTS so restarts never throw.
  await ensureSessionTable();

  app.use(
    session({
      store: new PgSession({ pool, createTableIfMissing: false }),
      secret: process.env.SESSION_SECRET || process.env.REPL_ID || 'dev-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  // Lightweight session-based "passport" shim — no passport dependency needed
  app.use((req, _res, next) => {
    req.isAuthenticated = () => !!(req.session && req.session.userId);
    if (req.session?.userId) {
      req.user = req.session.user ?? { id: req.session.userId };
    }
    next();
  });

  // Attempt OIDC discovery at startup (non-fatal if it fails)
  try {
    await getOidcConfig();
    console.log('[replitAuth] OIDC discovery OK');
  } catch (e) {
    console.warn('[replitAuth] OIDC discovery failed — auth routes will return 503:', e.message);
  }
}

// ── JWT helper (Supabase Bearer tokens) ─────────────────────────────────────

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decoded = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Upsert a Supabase JWT user into the local users table.
 * Supabase JWTs carry: sub (UUID), email, user_metadata.{full_name,display_name}
 */
async function upsertSupabaseUser(payload) {
  const id        = payload.sub;
  const email     = payload.email ?? null;
  const meta      = payload.user_metadata ?? {};
  const fullName  = (meta.full_name ?? meta.display_name ?? '').trim();
  const firstName = fullName.split(' ')[0] || null;
  const lastName  = fullName.split(' ').slice(1).join(' ') || null;
  await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       email      = COALESCE(EXCLUDED.email, users.email),
       first_name = COALESCE(EXCLUDED.first_name, users.first_name),
       last_name  = COALESCE(EXCLUDED.last_name, users.last_name),
       updated_at = now()`,
    [id, email, firstName, lastName],
  );
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0];
}

// ── isAuthenticated middleware ───────────────────────────────────────────────

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthorized — silakan login' });
}

/**
 * Middleware: accept EITHER Replit session OR Supabase Bearer JWT.
 * Populates req.user.id for downstream handlers.
 */
async function isAuthenticatedOrBearer(req, res, next) {
  // 1. Session-based (Replit OIDC)
  if (req.isAuthenticated && req.isAuthenticated()) return next();

  // 2. Supabase Bearer JWT
  const authHeader = req.headers['authorization'] ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = decodeJwtPayload(authHeader.slice(7));
    if (payload?.sub) {
      try {
        const user = await upsertSupabaseUser(payload);
        req.user = { id: user.id, ...user };
        return next();
      } catch (e) {
        console.error('[replitAuth] Bearer user upsert failed:', e.message);
      }
    }
  }

  return res.status(401).json({ error: 'Unauthorized — silakan login' });
}

// ── Auth routes ──────────────────────────────────────────────────────────────

function registerAuthRoutes(app) {
  // ── GET /api/login ─────────────────────────────────────────────────────────
  app.get('/api/login', async (req, res) => {
    try {
      const config      = await getOidcConfig();
      const state       = randomState();
      const nonce       = randomNonce();
      const codeVerifier= randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

      // Persist PKCE + state in session so callback can verify
      req.session.oidc = { state, nonce, codeVerifier };
      await new Promise((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );

      const redirectUri = `${process.env.REPLIT_DEV_DOMAIN ?? 'http://localhost:3001'}/api/callback`;

      const url = buildAuthorizationUrl(config, {
        redirect_uri:          redirectUri,
        response_type:         'code',
        scope:                 'openid email profile',
        state,
        nonce,
        code_challenge:        codeChallenge,
        code_challenge_method: 'S256',
      });

      return res.redirect(url.href);
    } catch (e) {
      console.error('[replitAuth] /api/login error:', e.message);
      return res.status(503).json({ error: 'Auth not configured: ' + e.message });
    }
  });

  // ── GET /api/callback ──────────────────────────────────────────────────────
  app.get('/api/callback', async (req, res) => {
    try {
      const config       = await getOidcConfig();
      const { state, nonce, codeVerifier } = req.session.oidc ?? {};

      if (!state || !codeVerifier) {
        return res.status(400).send('Missing OIDC session state. Please try logging in again.');
      }

      const redirectUri  = `${process.env.REPLIT_DEV_DOMAIN ?? 'http://localhost:3001'}/api/callback`;
      const currentUrl   = new URL(req.originalUrl, redirectUri);

      const tokenSet = await authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState:    state,
        expectedNonce:    nonce,
      });

      const claims  = tokenSet.claims();
      let userInfo  = {};
      try {
        userInfo = await fetchUserInfo(config, tokenSet.access_token, claims.sub);
      } catch (_) { /* profile data optional */ }

      const merged = { ...claims, ...userInfo };
      const user   = await upsertUser(merged);

      // Store user in session
      req.session.userId = user.id;
      req.session.user   = user;
      delete req.session.oidc;
      await new Promise((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );

      return res.redirect('/');
    } catch (e) {
      console.error('[replitAuth] /api/callback error:', e.message);
      return res.status(500).send('Login failed: ' + e.message);
    }
  });

  // ── GET /api/logout ────────────────────────────────────────────────────────
  app.get('/api/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });

  // ── GET /api/auth/user ─────────────────────────────────────────────────────
  // Accepts both Replit OIDC session and Supabase Bearer JWT.
  app.get('/api/auth/user', isAuthenticatedOrBearer, async (req, res) => {
    try {
      const userId = req.user.id;

      const { rows: memberRows } = await pool.query(
        `SELECT am.agency_id, am.role, am.commission_pct,
                a.name AS agency_name
         FROM agency_members am
         JOIN agencies a ON a.id = am.agency_id
         WHERE am.user_id = $1
         LIMIT 1`,
        [userId],
      );

      const membership = memberRows[0] ?? null;

      const { rows: userRows } = await pool.query(
        'SELECT * FROM users WHERE id = $1', [userId],
      );
      const user = userRows[0];

      const firstName   = user?.first_name ?? '';
      const lastName    = user?.last_name  ?? '';
      const displayName = [firstName, lastName].filter(Boolean).join(' ')
        || user?.email?.split('@')[0]
        || 'User';

      return res.json({
        id:              userId,
        email:           user?.email ?? '',
        displayName,
        profileImageUrl: user?.profile_image_url ?? null,
        role:            membership?.role ?? null,
        agencyId:        membership?.agency_id ?? null,
        agencyName:      membership?.agency_name ?? null,
        commissionPct:   Number(membership?.commission_pct ?? 0),
      });
    } catch (e) {
      console.error('[auth/user]', e);
      return res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { setupAuth, isAuthenticated, isAuthenticatedOrBearer, registerAuthRoutes };
