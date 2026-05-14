'use strict';

/**
 * Auth middleware — Supabase Bearer JWT only.
 * Replit OIDC telah dihapus. Auth menggunakan Supabase JWT dari frontend.
 */

const { pool } = require('./db.cjs');

// ── JWT helper ───────────────────────────────────────────────────────────────

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
 * Upsert a Supabase JWT user into the local users table (if PG is available).
 * Supabase JWTs carry: sub (UUID), email, user_metadata.{full_name, display_name}
 */
async function upsertSupabaseUser(payload) {
  const id        = payload.sub;
  const email     = payload.email ?? null;
  const meta      = payload.user_metadata ?? {};
  const fullName  = (meta.full_name ?? meta.display_name ?? '').trim();
  const firstName = fullName.split(' ')[0] || null;
  const lastName  = fullName.split(' ').slice(1).join(' ') || null;
  try {
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
    return rows[0] ?? { id, email, first_name: firstName, last_name: lastName };
  } catch {
    return { id, email, first_name: firstName, last_name: lastName };
  }
}

// ── No-op setupAuth (Replit OIDC removed) ───────────────────────────────────

async function setupAuth(_app) {
  // No-op — session-based Replit auth has been removed.
  // Auth is now handled purely via Supabase Bearer JWT.
}

// ── Middleware ───────────────────────────────────────────────────────────────

function isAuthenticated(req, res, next) {
  const authHeader = req.headers['authorization'] ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = decodeJwtPayload(authHeader.slice(7));
    if (payload?.sub) {
      req.user = { id: payload.sub, email: payload.email ?? null };
      return next();
    }
  }
  return res.status(401).json({ error: 'Unauthorized — silakan login' });
}

async function isAuthenticatedOrBearer(req, res, next) {
  const authHeader = req.headers['authorization'] ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = decodeJwtPayload(authHeader.slice(7));
    if (payload?.sub) {
      try {
        const user = await upsertSupabaseUser(payload);
        req.user = { id: user.id, email: user.email ?? null, ...user };
        return next();
      } catch (e) {
        console.error('[auth] Bearer user upsert failed:', e.message);
        req.user = { id: payload.sub, email: payload.email ?? null };
        return next();
      }
    }
  }
  return res.status(401).json({ error: 'Unauthorized — silakan login dengan Supabase' });
}

// ── Auth routes ──────────────────────────────────────────────────────────────

function registerAuthRoutes(app) {
  // GET /api/auth/user — returns caller identity from Supabase Bearer JWT
  app.get('/api/auth/user', isAuthenticatedOrBearer, async (req, res) => {
    try {
      const userId = req.user.id;
      const authHeader = req.headers['authorization'] ?? '';
      const supabaseUrl = process.env.VITE_SUPABASE_URL ?? '';
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';

      let membership = null;
      let userRow = null;

      // 1. Try local Replit PostgreSQL (if available)
      try {
        const { rows: memberRows } = await pool.query(
          `SELECT am.agency_id, am.role, am.commission_pct,
                  a.name AS agency_name
           FROM agency_members am
           JOIN agencies a ON a.id = am.agency_id
           WHERE am.user_id = $1
           LIMIT 1`,
          [userId],
        );
        membership = memberRows[0] ?? null;

        const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        userRow = userRows[0] ?? null;
      } catch (_) { /* fall through */ }

      // 2. Fallback: query Supabase REST API
      if (!membership && authHeader.startsWith('Bearer ') && supabaseUrl && anonKey) {
        try {
          const sbRes = await fetch(
            `${supabaseUrl}/rest/v1/agency_members?user_id=eq.${encodeURIComponent(userId)}&select=agency_id,role,commission_pct,agencies(name)&limit=1`,
            {
              headers: {
                'apikey': anonKey,
                'Authorization': authHeader,
                'Accept': 'application/json',
              },
            },
          );
          if (sbRes.ok) {
            const rows = await sbRes.json();
            if (rows[0]) {
              membership = {
                agency_id: rows[0].agency_id,
                role: rows[0].role,
                commission_pct: rows[0].commission_pct,
                agency_name: rows[0].agencies?.name ?? null,
              };
            }
          }
        } catch (_) { /* ignore */ }
      }

      const firstName   = userRow?.first_name ?? req.user?.first_name ?? '';
      const lastName    = userRow?.last_name  ?? req.user?.last_name  ?? '';
      const displayName = [firstName, lastName].filter(Boolean).join(' ')
        || userRow?.email?.split('@')[0]
        || req.user?.email?.split('@')[0]
        || 'User';

      return res.json({
        id:              userId,
        email:           userRow?.email ?? req.user?.email ?? '',
        displayName,
        profileImageUrl: userRow?.profile_image_url ?? null,
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
