'use strict';

/**
 * Auth middleware — Supabase Bearer JWT only.
 * Tidak ada Replit PG. Semua data agency dibaca dari Supabase.
 */

const { getSb } = require('./supabaseAdmin.cjs');

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

async function setupAuth(_app) { /* no-op */ }

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
      req.user = { id: payload.sub, email: payload.email ?? null };
      return next();
    }
  }
  return res.status(401).json({ error: 'Unauthorized — silakan login dengan Supabase' });
}

function registerAuthRoutes(app) {
  app.get('/api/auth/user', isAuthenticatedOrBearer, async (req, res) => {
    try {
      const sb = getSb();
      const userId = req.user.id;

      // Get agency membership + agency name via Supabase join
      const { data: memberRows, error: memErr } = await sb
        .from('agency_members')
        .select('agency_id, role, commission_pct, agencies(name)')
        .eq('user_id', userId)
        .limit(1);

      if (memErr) console.warn('[auth/user] membership query error:', memErr.message);

      const member = memberRows?.[0] ?? null;
      const email = req.user.email ?? '';
      const displayName = email.split('@')[0] || 'User';

      return res.json({
        id:              userId,
        email,
        displayName,
        profileImageUrl: null,
        role:            member?.role ?? null,
        agencyId:        member?.agency_id ?? null,
        agencyName:      member?.agencies?.name ?? null,
        commissionPct:   Number(member?.commission_pct ?? 0),
      });
    } catch (e) {
      console.error('[auth/user]', e);
      return res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { setupAuth, isAuthenticated, isAuthenticatedOrBearer, registerAuthRoutes };
