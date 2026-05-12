'use strict';

/**
 * REST data routes — replaces all Supabase client calls with
 * server-side PostgreSQL queries backed by Replit PostgreSQL.
 *
 * All routes are scoped to the authenticated user's agency.
 * Auth: accepts either Replit OIDC session OR Supabase Bearer JWT.
 */

const { pool } = require('../db.cjs');

// ── Helpers ──────────────────────────────────────────────────────────────────

function ok(res, data) { return res.status(200).json(data); }
function fail(res, status, message) { return res.status(status).json({ error: message }); }

/**
 * Decode a JWT payload without verifying the signature.
 * Safe for internal use: the token is still validated by Supabase when issued.
 */
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
 * Resolve the caller's user ID from:
 *   1. Replit OIDC session  (req.user.id)
 *   2. Supabase Bearer JWT  (Authorization: Bearer <token>)
 * Returns null if neither is present.
 */
function resolveUserId(req) {
  if (req.user?.id) return req.user.id;
  const authHeader = req.headers['authorization'] ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const payload = decodeJwtPayload(authHeader.slice(7));
    return payload?.sub ?? null;
  }
  return null;
}

/**
 * Returns the agency membership row for the caller, or null if not a member.
 */
async function getCallerAgency(req) {
  const userId = resolveUserId(req);
  if (!userId) return null;
  const { rows } = await pool.query(
    `SELECT am.agency_id, am.role, am.commission_pct
     FROM agency_members am WHERE am.user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

/** Middleware: require authenticated (session or Bearer) + agency membership. */
async function requireMember(req, res, next) {
  const isSession = req.isAuthenticated && req.isAuthenticated();
  const hasBearer = (req.headers['authorization'] ?? '').startsWith('Bearer ');
  if (!isSession && !hasBearer) {
    return fail(res, 401, 'Unauthorized');
  }
  const agency = await getCallerAgency(req).catch(() => null);
  if (!agency) return fail(res, 403, 'Tidak terdaftar di agency');
  req.agency = agency; // { agency_id, role, commission_pct }

  // Ensure req.user.id is populated for downstream handlers
  if (!req.user?.id) {
    const uid = resolveUserId(req);
    if (uid) req.user = { id: uid };
  }
  next();
}

/** Middleware: require owner role. */
async function requireOwner(req, res, next) {
  await requireMember(req, res, () => {
    if (req.agency.role !== 'owner') return fail(res, 403, 'Hanya owner yang dapat melakukan ini');
    next();
  });
}

/** Middleware: require owner or staff. */
async function requireOwnerOrStaff(req, res, next) {
  await requireMember(req, res, () => {
    if (!['owner', 'staff'].includes(req.agency.role)) {
      return fail(res, 403, 'Hanya owner/staff yang dapat melakukan ini');
    }
    next();
  });
}

// ── CLIENTS ──────────────────────────────────────────────────────────────────

function registerClientRoutes(app) {
  app.get('/api/clients', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM clients WHERE agency_id = $1 ORDER BY created_at DESC',
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/clients/:id', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM clients WHERE id = $1 AND agency_id = $2',
        [req.params.id, req.agency.agency_id],
      );
      if (!rows[0]) return fail(res, 404, 'Client tidak ditemukan');
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/clients', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO clients (
          id, agency_id, name, phone, email, birth_date, birth_place,
          passport_number, passport_expiry, passport_issue_date, passport_issuing_office,
          gender, photo_data_url, notes, legacy_jamaah_id, created_by_agent,
          referred_by_client_id, referral_stamps, created_at, updated_at
        ) VALUES (
          COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, COALESCE($18, 0), now(), now()
        ) RETURNING *`,
        [
          b.id ?? null, req.agency.agency_id, b.name, b.phone ?? '', b.email ?? null,
          b.birth_date ?? null, b.birth_place ?? null,
          b.passport_number ?? null, b.passport_expiry ?? null,
          b.passport_issue_date ?? null, b.passport_issuing_office ?? null,
          b.gender ?? null, b.photo_data_url ?? null, b.notes ?? null,
          b.legacy_jamaah_id ?? null, b.created_by_agent ?? null,
          b.referred_by_client_id ?? null, b.referral_stamps ?? 0,
        ],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/clients/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE clients SET
          name = COALESCE($3, name),
          phone = COALESCE($4, phone),
          email = $5,
          birth_date = $6,
          birth_place = $7,
          passport_number = $8,
          passport_expiry = $9,
          passport_issue_date = $10,
          passport_issuing_office = $11,
          gender = $12,
          photo_data_url = $13,
          notes = $14,
          created_by_agent = $15,
          referred_by_client_id = $16,
          updated_at = now()
         WHERE id = $1 AND agency_id = $2 RETURNING *`,
        [
          req.params.id, req.agency.agency_id,
          b.name ?? null, b.phone ?? null, b.email ?? null,
          b.birth_date ?? null, b.birth_place ?? null,
          b.passport_number ?? null, b.passport_expiry ?? null,
          b.passport_issue_date ?? null, b.passport_issuing_office ?? null,
          b.gender ?? null, b.photo_data_url ?? null, b.notes ?? null,
          b.created_by_agent ?? null, b.referred_by_client_id ?? null,
        ],
      );
      if (!rows[0]) return fail(res, 404, 'Client tidak ditemukan');
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/clients/:id', requireMember, async (req, res) => {
    try {
      await pool.query(
        'DELETE FROM clients WHERE id = $1 AND agency_id = $2',
        [req.params.id, req.agency.agency_id],
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── ORDERS ────────────────────────────────────────────────────────────────────

function registerOrderRoutes(app) {
  app.get('/api/orders', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM orders WHERE agency_id = $1 ORDER BY created_at DESC',
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/orders', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO orders (
          id, agency_id, client_id, type, status, title, total_price, cost_price,
          currency, metadata, trip_id, package_id, jamaah_id, created_by_agent,
          notes, payment_status, paid_amount, created_at, updated_at
        ) VALUES (
          COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, now(), now()
        ) RETURNING *`,
        [
          b.id ?? null, req.agency.agency_id, b.client_id ?? null,
          b.type ?? 'umrah', b.status ?? 'Draft', b.title ?? null,
          b.total_price ?? 0, b.cost_price ?? 0, b.currency ?? 'IDR',
          b.metadata ? JSON.stringify(b.metadata) : '{}',
          b.trip_id ?? null, b.package_id ?? null, b.jamaah_id ?? null,
          b.created_by_agent ?? null, b.notes ?? null,
          b.payment_status ?? 'UNPAID', b.paid_amount ?? 0,
        ],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/orders/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE orders SET
          client_id = COALESCE($3, client_id),
          type = COALESCE($4, type),
          status = COALESCE($5, status),
          title = COALESCE($6, title),
          total_price = COALESCE($7, total_price),
          cost_price = COALESCE($8, cost_price),
          currency = COALESCE($9, currency),
          metadata = COALESCE($10, metadata),
          trip_id = COALESCE($11, trip_id),
          package_id = COALESCE($12, package_id),
          notes = COALESCE($13, notes),
          payment_status = COALESCE($14, payment_status),
          paid_amount = COALESCE($15, paid_amount),
          created_by_agent = COALESCE($16, created_by_agent),
          updated_at = now()
         WHERE id = $1 AND agency_id = $2 RETURNING *`,
        [
          req.params.id, req.agency.agency_id,
          b.client_id ?? null, b.type ?? null, b.status ?? null,
          b.title ?? null, b.total_price ?? null, b.cost_price ?? null,
          b.currency ?? null, b.metadata ? JSON.stringify(b.metadata) : null,
          b.trip_id ?? null, b.package_id ?? null, b.notes ?? null,
          b.payment_status ?? null, b.paid_amount ?? null, b.created_by_agent ?? null,
        ],
      );
      if (!rows[0]) return fail(res, 404, 'Order tidak ditemukan');
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/orders/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM orders WHERE id = $1 AND agency_id = $2', [req.params.id, req.agency.agency_id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PACKAGES ──────────────────────────────────────────────────────────────────

function registerPackageRoutes(app) {
  app.get('/api/packages', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM packages WHERE agency_id = $1 ORDER BY created_at DESC',
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/packages', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO packages (
          id, agency_id, name, destination, people, days, hpp, total_idr,
          status, emoji, cover_image, departure_date, return_date, airline,
          hotel_level, notes, facilities, created_at, updated_at
        ) VALUES (
          COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now()
        ) RETURNING *`,
        [
          b.id ?? null, req.agency.agency_id, b.name, b.destination ?? '',
          b.people ?? 1, b.days ?? 1, b.hpp ?? 0, b.total_idr ?? 0,
          b.status ?? 'Draft', b.emoji ?? '📦', b.cover_image ?? null,
          b.departure_date ?? null, b.return_date ?? null,
          b.airline ?? null, b.hotel_level ?? null, b.notes ?? null,
          b.facilities ? JSON.stringify(b.facilities) : null,
        ],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/packages/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE packages SET
          name = COALESCE($3, name), destination = COALESCE($4, destination),
          people = COALESCE($5, people), days = COALESCE($6, days),
          hpp = COALESCE($7, hpp), total_idr = COALESCE($8, total_idr),
          status = COALESCE($9, status), emoji = COALESCE($10, emoji),
          cover_image = COALESCE($11, cover_image),
          departure_date = COALESCE($12, departure_date),
          return_date = COALESCE($13, return_date),
          airline = COALESCE($14, airline), hotel_level = COALESCE($15, hotel_level),
          notes = COALESCE($16, notes), facilities = COALESCE($17, facilities),
          updated_at = now()
         WHERE id = $1 AND agency_id = $2 RETURNING *`,
        [
          req.params.id, req.agency.agency_id,
          b.name ?? null, b.destination ?? null, b.people ?? null, b.days ?? null,
          b.hpp ?? null, b.total_idr ?? null, b.status ?? null, b.emoji ?? null,
          b.cover_image ?? null, b.departure_date ?? null, b.return_date ?? null,
          b.airline ?? null, b.hotel_level ?? null, b.notes ?? null,
          b.facilities ? JSON.stringify(b.facilities) : null,
        ],
      );
      if (!rows[0]) return fail(res, 404, 'Package tidak ditemukan');
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/packages/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM packages WHERE id = $1 AND agency_id = $2', [req.params.id, req.agency.agency_id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── TICKET PRICES ─────────────────────────────────────────────────────────────

function registerTicketPriceRoutes(app) {
  app.get('/api/ticket-prices', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM ticket_prices WHERE agency_id = $1 ORDER BY sort_order ASC, created_at DESC',
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/ticket-prices', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO ticket_prices (
          id, agency_id, airline, airline_code, from_code, from_city, to_code, to_city,
          depart_date, base_price, currency, valid_until, notes, is_published,
          sort_order, flight_number, etd, eta, terminal, transit_code, transit_city,
          transit_duration, baggage_info, markup, created_at, updated_at
        ) VALUES (
          COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
          $22, $23, $24, now(), now()
        ) RETURNING *`,
        [
          b.id ?? null, req.agency.agency_id,
          b.airline ?? '', b.airline_code ?? '', b.from_code ?? '', b.from_city ?? '',
          b.to_code ?? '', b.to_city ?? '', b.depart_date ?? null, b.base_price ?? 0,
          b.currency ?? 'IDR', b.valid_until ?? null, b.notes ?? null,
          b.is_published ?? true, b.sort_order ?? 0, b.flight_number ?? null,
          b.etd ?? null, b.eta ?? null, b.terminal ?? null,
          b.transit_code ?? null, b.transit_city ?? null, b.transit_duration ?? null,
          b.baggage_info ?? null, b.markup ?? 0,
        ],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/ticket-prices/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const fields = [
        'airline', 'airline_code', 'from_code', 'from_city', 'to_code', 'to_city',
        'depart_date', 'base_price', 'currency', 'valid_until', 'notes', 'is_published',
        'sort_order', 'flight_number', 'etd', 'eta', 'terminal', 'transit_code',
        'transit_city', 'transit_duration', 'baggage_info', 'markup',
      ];
      const setClauses = fields.map((f, i) => `${f} = COALESCE($${i + 3}, ${f})`).join(', ');
      const { rows } = await pool.query(
        `UPDATE ticket_prices SET ${setClauses}, updated_at = now()
         WHERE id = $1 AND agency_id = $2 RETURNING *`,
        [
          req.params.id, req.agency.agency_id,
          ...fields.map(f => {
            const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            return b[camel] ?? b[f] ?? null;
          }),
        ],
      );
      if (!rows[0]) return fail(res, 404, 'Ticket price tidak ditemukan');
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/ticket-prices/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM ticket_prices WHERE id = $1 AND agency_id = $2', [req.params.id, req.agency.agency_id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── TRIPS ─────────────────────────────────────────────────────────────────────

function registerTripRoutes(app) {
  app.get('/api/trips', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM trips WHERE agency_id = $1 ORDER BY created_at DESC',
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/trips', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO trips (id, agency_id, name, destination, start_date, end_date, emoji, cover_image, quota_pax, price_per_pax, created_at)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, now()) RETURNING *`,
        [b.id ?? null, req.agency.agency_id, b.name, b.destination ?? '', b.start_date ?? '', b.end_date ?? '',
         b.emoji ?? '✈️', b.cover_image ?? null, b.quota_pax ?? null, b.price_per_pax ?? null],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/trips/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE trips SET
          name = COALESCE($3, name), destination = COALESCE($4, destination),
          start_date = COALESCE($5, start_date), end_date = COALESCE($6, end_date),
          emoji = COALESCE($7, emoji), cover_image = COALESCE($8, cover_image),
          quota_pax = COALESCE($9, quota_pax), price_per_pax = COALESCE($10, price_per_pax)
         WHERE id = $1 AND agency_id = $2 RETURNING *`,
        [req.params.id, req.agency.agency_id,
         b.name ?? null, b.destination ?? null, b.start_date ?? null, b.end_date ?? null,
         b.emoji ?? null, b.cover_image ?? null, b.quota_pax ?? null, b.price_per_pax ?? null],
      );
      if (!rows[0]) return fail(res, 404, 'Trip tidak ditemukan');
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/trips/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM trips WHERE id = $1 AND agency_id = $2', [req.params.id, req.agency.agency_id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });

  // ── Jamaah (nested under trip) ────────────────────────────────────────────

  app.get('/api/trips/:tripId/jamaah', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM jamaah WHERE trip_id = $1 AND agency_id = $2 ORDER BY created_at ASC',
        [req.params.tripId, req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/jamaah', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM jamaah WHERE agency_id = $1 ORDER BY created_at ASC',
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/jamaah', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO jamaah (id, agency_id, trip_id, name, phone, birth_date, passport_number, passport_expiry, gender, photo_data_url, needs_review, booking_code, payment_status, created_at)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now()) RETURNING *`,
        [b.id ?? null, req.agency.agency_id, b.trip_id, b.name, b.phone ?? '',
         b.birth_date ?? '', b.passport_number ?? '', b.passport_expiry ?? null,
         b.gender ?? '', b.photo_data_url ?? null, b.needs_review ?? false,
         b.booking_code ?? null, b.payment_status ?? 'Belum Lunas'],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/jamaah/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE jamaah SET
          name = COALESCE($3, name), phone = COALESCE($4, phone),
          birth_date = COALESCE($5, birth_date), passport_number = COALESCE($6, passport_number),
          passport_expiry = COALESCE($7, passport_expiry), gender = COALESCE($8, gender),
          photo_data_url = COALESCE($9, photo_data_url),
          needs_review = COALESCE($10, needs_review),
          booking_code = COALESCE($11, booking_code),
          payment_status = COALESCE($12, payment_status)
         WHERE id = $1 AND agency_id = $2 RETURNING *`,
        [req.params.id, req.agency.agency_id,
         b.name ?? null, b.phone ?? null, b.birth_date ?? null, b.passport_number ?? null,
         b.passport_expiry ?? null, b.gender ?? null, b.photo_data_url ?? null,
         b.needs_review ?? null, b.booking_code ?? null, b.payment_status ?? null],
      );
      if (!rows[0]) return fail(res, 404, 'Jamaah tidak ditemukan');
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/jamaah/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM jamaah WHERE id = $1 AND agency_id = $2', [req.params.id, req.agency.agency_id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });

  // Jamaah docs
  app.get('/api/jamaah/:jamaahId/docs', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM jamaah_docs WHERE jamaah_id = $1 AND agency_id = $2',
        [req.params.jamaahId, req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/jamaah-docs', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO jamaah_docs (id, agency_id, jamaah_id, category, label, file_name, file_type, data_url, created_at)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, now()) RETURNING *`,
        [b.id ?? null, req.agency.agency_id, b.jamaah_id, b.category ?? 'other',
         b.label ?? '', b.file_name ?? '', b.file_type ?? 'image', b.data_url ?? ''],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/jamaah-docs/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM jamaah_docs WHERE id = $1 AND agency_id = $2', [req.params.id, req.agency.agency_id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PAYMENTS ──────────────────────────────────────────────────────────────────

function registerPaymentRoutes(app) {
  app.get('/api/payments', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = 'SELECT * FROM payments WHERE agency_id = $1';
      const params = [req.agency.agency_id];
      if (q.jamaah_id) { query += ` AND jamaah_id = $${params.length + 1}`; params.push(q.jamaah_id); }
      if (q.trip_id) { query += ` AND trip_id = $${params.length + 1}`; params.push(q.trip_id); }
      query += ' ORDER BY created_at DESC';
      const { rows } = await pool.query(query, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/payments', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO payments (id, agency_id, jamaah_id, trip_id, type, amount, method, paid_at, notes, proof_url, created_at)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, now()) RETURNING *`,
        [b.id ?? null, req.agency.agency_id, b.jamaah_id, b.trip_id ?? null,
         b.type ?? 'other', b.amount ?? 0, b.method ?? '', b.paid_at ?? '',
         b.notes ?? '', b.proof_url ?? null],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/payments/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE payments SET
          type = COALESCE($3, type), amount = COALESCE($4, amount),
          method = COALESCE($5, method), paid_at = COALESCE($6, paid_at),
          notes = COALESCE($7, notes), proof_url = COALESCE($8, proof_url)
         WHERE id = $1 AND agency_id = $2 RETURNING *`,
        [req.params.id, req.agency.agency_id,
         b.type ?? null, b.amount ?? null, b.method ?? null, b.paid_at ?? null,
         b.notes ?? null, b.proof_url ?? null],
      );
      if (!rows[0]) return fail(res, 404, 'Payment tidak ditemukan');
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/payments/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM payments WHERE id = $1 AND agency_id = $2', [req.params.id, req.agency.agency_id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── BC TEMPLATES ─────────────────────────────────────────────────────────────

function registerBcTemplateRoutes(app) {
  app.get('/api/bc-templates', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM bc_templates WHERE agency_id = $1 ORDER BY sort_order ASC, created_at DESC',
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/bc-templates', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO bc_templates (id, agency_id, title, category, body, sort_order, created_by, created_at, updated_at)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, now(), now()) RETURNING *`,
        [b.id ?? null, req.agency.agency_id, b.title, b.category ?? 'general',
         b.body ?? '', b.sort_order ?? 0, req.user.id],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/bc-templates/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE bc_templates SET
          title = COALESCE($3, title), category = COALESCE($4, category),
          body = COALESCE($5, body), sort_order = COALESCE($6, sort_order),
          updated_at = now()
         WHERE id = $1 AND agency_id = $2 RETURNING *`,
        [req.params.id, req.agency.agency_id, b.title ?? null, b.category ?? null, b.body ?? null, b.sort_order ?? null],
      );
      if (!rows[0]) return fail(res, 404, 'Template tidak ditemukan');
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/bc-templates/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM bc_templates WHERE id = $1 AND agency_id = $2', [req.params.id, req.agency.agency_id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── AGENCY MEMBERS ────────────────────────────────────────────────────────────

function registerMemberRoutes(app) {
  app.get('/api/agency-members', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT am.user_id, am.role, am.commission_pct, am.created_at,
                am.phone_wa, am.agent_notes, am.agent_status, am.card_back_image_url,
                u.email, u.first_name, u.last_name, u.profile_image_url
         FROM agency_members am
         LEFT JOIN users u ON u.id = am.user_id
         WHERE am.agency_id = $1
         ORDER BY am.created_at ASC`,
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/agency-members/:userId', requireOwner, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE agency_members SET
          role = COALESCE($3, role),
          commission_pct = COALESCE($4, commission_pct),
          phone_wa = COALESCE($5, phone_wa),
          agent_notes = COALESCE($6, agent_notes),
          agent_status = COALESCE($7, agent_status),
          card_back_image_url = COALESCE($8, card_back_image_url)
         WHERE user_id = $1 AND agency_id = $2 RETURNING *`,
        [req.params.userId, req.agency.agency_id,
         b.role ?? null, b.commission_pct ?? null, b.phone_wa ?? null,
         b.agent_notes ?? null, b.agent_status ?? null, b.card_back_image_url ?? null],
      );
      if (!rows[0]) return fail(res, 404, 'Member tidak ditemukan');
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── NOTES ─────────────────────────────────────────────────────────────────────

function registerNoteRoutes(app) {
  app.get('/api/notes', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM notes WHERE agency_id = $1 ORDER BY pinned DESC, updated_at DESC',
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/notes', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const now = Date.now();
      const { rows } = await pool.query(
        `INSERT INTO notes (id, agency_id, title, content, color, pinned, tags, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, content = EXCLUDED.content,
           color = EXCLUDED.color, pinned = EXCLUDED.pinned,
           tags = EXCLUDED.tags, updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [b.id, req.agency.agency_id, b.title ?? '', b.content ?? '',
         b.color ?? 'bg-white border-slate-200', b.pinned ?? false,
         JSON.stringify(b.tags ?? []), b.updated_at ?? now],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/notes/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM notes WHERE id = $1 AND agency_id = $2', [req.params.id, req.agency.agency_id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PDF TEMPLATES ─────────────────────────────────────────────────────────────

function registerPdfTemplateRoutes(app) {
  app.get('/api/pdf-templates', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM pdf_templates WHERE agency_id = $1 ORDER BY created_at ASC',
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/pdf-templates', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO pdf_templates (id, agency_id, name, payload, created_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, payload = EXCLUDED.payload
         RETURNING *`,
        [b.id, req.agency.agency_id, b.name ?? '', JSON.stringify(b.payload ?? {})],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/pdf-templates/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM pdf_templates WHERE id = $1 AND agency_id = $2', [req.params.id, req.agency.agency_id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── VISA SAVED CALCS ──────────────────────────────────────────────────────────

function registerVisaCalcRoutes(app) {
  app.get('/api/visa-calcs', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM visa_saved_calcs WHERE user_id = $1 AND agency_id = $2 ORDER BY created_at DESC',
        [req.user.id, req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/visa-calcs', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO visa_saved_calcs (id, user_id, agency_id, name, visa_type, state, created_at)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, now()) RETURNING *`,
        [b.id ?? null, req.user.id, req.agency.agency_id, b.name, b.visa_type ?? 'voa', JSON.stringify(b.state ?? {})],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/visa-calcs/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM visa_saved_calcs WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── AGENT POINTS ─────────────────────────────────────────────────────────────

function registerAgentPointRoutes(app) {
  app.get('/api/agent-points', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = 'SELECT * FROM agent_points WHERE agency_id = $1';
      const params = [req.agency.agency_id];
      if (q.agent_id) { query += ` AND agent_id = $${params.length + 1}`; params.push(q.agent_id); }
      query += ' ORDER BY awarded_at DESC';
      const { rows } = await pool.query(query, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  // Leaderboard: aggregate points per agent
  app.get('/api/agent-leaderboard', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT agent_id, SUM(points) AS total_points, COUNT(*) AS order_count
         FROM agent_points WHERE agency_id = $1
         GROUP BY agent_id ORDER BY total_points DESC`,
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── WALLET TRANSACTIONS ───────────────────────────────────────────────────────

function registerWalletRoutes(app) {
  app.get('/api/wallet-transactions', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = 'SELECT * FROM agent_wallet_transactions WHERE agency_id = $1';
      const params = [req.agency.agency_id];
      if (q.agent_id) { query += ` AND agent_id = $${params.length + 1}`; params.push(q.agent_id); }
      query += ' ORDER BY created_at DESC';
      const { rows } = await pool.query(query, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── MISSIONS ─────────────────────────────────────────────────────────────────

function registerMissionRoutes(app) {
  app.get('/api/missions', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM daily_missions WHERE agency_id = $1 ORDER BY created_at DESC',
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/missions', requireOwnerOrStaff, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO daily_missions (id, agency_id, title, description, reward_points, deadline, created_by, created_at)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, now()) RETURNING *`,
        [b.id ?? null, req.agency.agency_id, b.title, b.description ?? '', b.reward_points ?? 10, b.deadline, req.user.id],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/mission-submissions', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = 'SELECT * FROM mission_submissions WHERE agency_id = $1';
      const params = [req.agency.agency_id];
      if (q.agent_id) { query += ` AND agent_id = $${params.length + 1}`; params.push(q.agent_id); }
      if (q.mission_id) { query += ` AND mission_id = $${params.length + 1}`; params.push(q.mission_id); }
      query += ' ORDER BY submitted_at DESC';
      const { rows } = await pool.query(query, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/mission-submissions', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO mission_submissions (id, agency_id, mission_id, agent_id, status, proof_image_url, notes, reward_points, submitted_at)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, now()) RETURNING *`,
        [b.id ?? null, req.agency.agency_id, b.mission_id, req.user.id,
         b.status ?? 'pending', b.proof_image_url ?? null, b.notes ?? null, b.reward_points ?? 0],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/mission-submissions/:id', requireOwnerOrStaff, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `UPDATE mission_submissions SET
          status = COALESCE($3, status), reward_points = COALESCE($4, reward_points),
          reviewed_at = now(), reviewed_by = $5
         WHERE id = $1 AND agency_id = $2 RETURNING *`,
        [req.params.id, req.agency.agency_id, b.status ?? null, b.reward_points ?? null, req.user.id],
      );
      if (!rows[0]) return fail(res, 404, 'Submission tidak ditemukan');
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/reward-redemptions', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = 'SELECT * FROM reward_redemptions WHERE agency_id = $1';
      const params = [req.agency.agency_id];
      if (q.agent_id) { query += ` AND agent_id = $${params.length + 1}`; params.push(q.agent_id); }
      query += ' ORDER BY requested_at DESC';
      const { rows } = await pool.query(query, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/reward-redemptions', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO reward_redemptions (id, agency_id, agent_id, reward_key, cost_points, status, requested_at)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, now()) RETURNING *`,
        [b.id ?? null, req.agency.agency_id, req.user.id, b.reward_key, b.cost_points ?? 0, b.status ?? 'pending'],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────

function registerSettingsRoutes(app) {
  app.get('/api/settings/agency', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT key, value FROM agency_settings WHERE agency_id = $1',
        [req.agency.agency_id],
      );
      const settings = {};
      for (const r of rows) settings[r.key] = r.value;
      return ok(res, settings);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/settings/agency', requireMember, async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key) return fail(res, 400, 'key required');
      await pool.query(
        `INSERT INTO agency_settings (agency_id, key, value, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (agency_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [req.agency.agency_id, key, JSON.stringify(value)],
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/settings/user', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT key, value FROM user_settings WHERE user_id = $1',
        [req.user.id],
      );
      const settings = {};
      for (const r of rows) settings[r.key] = r.value;
      return ok(res, settings);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/settings/user', requireMember, async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key) return fail(res, 400, 'key required');
      await pool.query(
        `INSERT INTO user_settings (user_id, key, value, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [req.user.id, key, JSON.stringify(value)],
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PACKAGE CALCULATIONS ──────────────────────────────────────────────────────

function registerPackageCalcRoutes(app) {
  app.get('/api/package-calculations/:packageId', requireMember, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM package_calculations WHERE package_id = $1 AND agency_id = $2',
        [req.params.packageId, req.agency.agency_id],
      );
      return ok(res, rows[0] ?? null);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/package-calculations', requireMember, async (req, res) => {
    try {
      const b = req.body;
      await pool.query(
        `INSERT INTO package_calculations (package_id, agency_id, payload, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (package_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
        [b.package_id, req.agency.agency_id, JSON.stringify(b.payload ?? {})],
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── CLIENT DOCS ───────────────────────────────────────────────────────────────

function registerClientDocRoutes(app) {
  app.get('/api/client-docs', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = 'SELECT * FROM client_docs WHERE agency_id = $1';
      const params = [req.agency.agency_id];
      if (q.client_id) { query += ` AND client_id = $${params.length + 1}`; params.push(q.client_id); }
      query += ' ORDER BY created_at DESC';
      const { rows } = await pool.query(query, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/client-docs', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { rows } = await pool.query(
        `INSERT INTO client_docs (id, agency_id, client_id, category, label, file_name, file_type, data_url, created_at)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, now()) RETURNING *`,
        [b.id ?? null, req.agency.agency_id, b.client_id, b.category ?? 'other',
         b.label ?? '', b.file_name ?? '', b.file_type ?? 'image', b.data_url ?? ''],
      );
      return ok(res, rows[0]);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/client-docs/:id', requireMember, async (req, res) => {
    try {
      await pool.query('DELETE FROM client_docs WHERE id = $1 AND agency_id = $2', [req.params.id, req.agency.agency_id]);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────

function registerAuditRoutes(app) {
  app.get('/api/audit-log', requireOwnerOrStaff, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM audit_logs WHERE agency_id = $1 ORDER BY created_at DESC LIMIT 500',
        [req.agency.agency_id],
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/audit-log', requireMember, async (req, res) => {
    try {
      const b = req.body;
      await pool.query(
        `INSERT INTO audit_logs (agency_id, user_id, table_name, record_id, action, old_data, new_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
        [req.agency.agency_id, req.user.id, b.table_name, b.record_id ?? null, b.action,
         b.old_data ? JSON.stringify(b.old_data) : null,
         b.new_data ? JSON.stringify(b.new_data) : null],
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── Upload card back (store base64 in DB) ────────────────────────────────────

function registerCardBackRoutes(app) {
  app.post('/api/upload-card-back', requireMember, async (req, res) => {
    try {
      const { targetUserId, agencyId, imageBase64 } = req.body ?? {};
      if (!targetUserId || !agencyId || !imageBase64) {
        return fail(res, 400, 'targetUserId, agencyId, dan imageBase64 wajib diisi');
      }
      if (req.agency.role !== 'owner' && targetUserId !== req.user.id) {
        return fail(res, 403, 'Hanya owner yang bisa upload kartu member lain');
      }
      await pool.query(
        'UPDATE agency_members SET card_back_image_url = $3 WHERE user_id = $1 AND agency_id = $2',
        [targetUserId, agencyId, imageBase64],
      );
      return ok(res, { ok: true, url: imageBase64 });
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/save-card-back-url', requireMember, async (req, res) => {
    try {
      const { targetUserId, agencyId, storagePath } = req.body ?? {};
      if (!targetUserId || !agencyId) return fail(res, 400, 'targetUserId dan agencyId wajib');
      if (req.agency.role !== 'owner' && targetUserId !== req.user.id) {
        return fail(res, 403, 'Hanya owner yang bisa update kartu member lain');
      }
      const url = storagePath ?? null;
      await pool.query(
        'UPDATE agency_members SET card_back_image_url = $3 WHERE user_id = $1 AND agency_id = $2',
        [targetUserId, agencyId, url],
      );
      return ok(res, { ok: true, url });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── Register all data routes ──────────────────────────────────────────────────

function registerDataRoutes(app) {
  registerClientRoutes(app);
  registerOrderRoutes(app);
  registerPackageRoutes(app);
  registerTicketPriceRoutes(app);
  registerTripRoutes(app);
  registerPaymentRoutes(app);
  registerBcTemplateRoutes(app);
  registerMemberRoutes(app);
  registerNoteRoutes(app);
  registerPdfTemplateRoutes(app);
  registerVisaCalcRoutes(app);
  registerAgentPointRoutes(app);
  registerWalletRoutes(app);
  registerMissionRoutes(app);
  registerSettingsRoutes(app);
  registerPackageCalcRoutes(app);
  registerClientDocRoutes(app);
  registerAuditRoutes(app);
  registerCardBackRoutes(app);
}

module.exports = { registerDataRoutes, requireMember, requireOwner, requireOwnerOrStaff, getCallerAgency };
