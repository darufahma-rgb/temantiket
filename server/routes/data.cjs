'use strict';

const { query, queryOne } = require('../pgDb.cjs');

function ok(res, data) { return res.status(200).json(data); }
function fail(res, code, message) { return res.status(code).json({ error: message }); }

function pick(obj, keys) {
  const result = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) result[k] = obj[k];
  }
  return result;
}

async function getCallerAgency(req) {
  const userId = req.user?.id;
  if (!userId) return null;
  try {
    return await queryOne(
      `SELECT agency_id, role, commission_pct FROM agency_members WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
  } catch (e) {
    console.warn('[getCallerAgency]', e.message);
    return null;
  }
}

async function requireMember(req, res, next) {
  if (!req.user?.id) return fail(res, 401, 'Unauthorized');
  const agency = await getCallerAgency(req).catch(() => null);
  if (!agency) return fail(res, 403, 'Tidak terdaftar di agency');
  req.agency = agency;
  next();
}

async function requireOwner(req, res, next) {
  await requireMember(req, res, () => {
    if (req.agency.role !== 'owner') return fail(res, 403, 'Hanya owner yang dapat melakukan ini');
    next();
  });
}

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
      const rows = await query(
        `SELECT * FROM clients WHERE agency_id = $1 ORDER BY created_at DESC`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/clients/:id', requireMember, async (req, res) => {
    try {
      const row = await queryOne(
        `SELECT * FROM clients WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      if (!row) return fail(res, 404, 'Client tidak ditemukan');
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/clients', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const id = b.id || undefined;
      const row = await queryOne(
        `INSERT INTO clients (${id ? 'id, ' : ''}agency_id, name, phone, email, birth_date, birth_place,
          passport_number, passport_expiry, passport_issue_date, passport_issuing_office,
          gender, photo_data_url, notes, legacy_jamaah_id, created_by_agent,
          referred_by_client_id, referral_stamps)
         VALUES (${id ? '$1, $2' : '$1'}, ${id ? '$3' : '$2'}, ${id ? '$4' : '$3'}, ${id ? '$5' : '$4'},
                 ${id ? '$6' : '$5'}, ${id ? '$7' : '$6'}, ${id ? '$8' : '$7'}, ${id ? '$9' : '$8'},
                 ${id ? '$10' : '$9'}, ${id ? '$11' : '$10'}, ${id ? '$12' : '$11'}, ${id ? '$13' : '$12'},
                 ${id ? '$14' : '$13'}, ${id ? '$15' : '$14'}, ${id ? '$16' : '$15'}, ${id ? '$17' : '$16'},
                 ${id ? '$18' : '$17'}, ${id ? '$19' : '$18'})
         RETURNING *`,
        id
          ? [id, req.agency.agency_id, b.name, b.phone ?? '', b.email ?? null, b.birth_date ?? null,
             b.birth_place ?? null, b.passport_number ?? null, b.passport_expiry ?? null,
             b.passport_issue_date ?? null, b.passport_issuing_office ?? null,
             b.gender ?? null, b.photo_data_url ?? null, b.notes ?? null,
             b.legacy_jamaah_id ?? null, b.created_by_agent ?? null,
             b.referred_by_client_id ?? null, b.referral_stamps ?? 0]
          : [req.agency.agency_id, b.name, b.phone ?? '', b.email ?? null, b.birth_date ?? null,
             b.birth_place ?? null, b.passport_number ?? null, b.passport_expiry ?? null,
             b.passport_issue_date ?? null, b.passport_issuing_office ?? null,
             b.gender ?? null, b.photo_data_url ?? null, b.notes ?? null,
             b.legacy_jamaah_id ?? null, b.created_by_agent ?? null,
             b.referred_by_client_id ?? null, b.referral_stamps ?? 0]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/clients/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `UPDATE clients SET
          name = COALESCE($1, name), phone = COALESCE($2, phone), email = COALESCE($3, email),
          birth_date = COALESCE($4, birth_date), birth_place = COALESCE($5, birth_place),
          passport_number = COALESCE($6, passport_number), passport_expiry = COALESCE($7, passport_expiry),
          passport_issue_date = COALESCE($8, passport_issue_date),
          passport_issuing_office = COALESCE($9, passport_issuing_office),
          gender = COALESCE($10, gender), photo_data_url = COALESCE($11, photo_data_url),
          notes = COALESCE($12, notes), created_by_agent = COALESCE($13, created_by_agent),
          referred_by_client_id = COALESCE($14, referred_by_client_id),
          updated_at = NOW()
         WHERE id = $15 AND agency_id = $16
         RETURNING *`,
        [b.name ?? null, b.phone ?? null, b.email ?? null, b.birth_date ?? null,
         b.birth_place ?? null, b.passport_number ?? null, b.passport_expiry ?? null,
         b.passport_issue_date ?? null, b.passport_issuing_office ?? null,
         b.gender ?? null, b.photo_data_url ?? null, b.notes ?? null,
         b.created_by_agent ?? null, b.referred_by_client_id ?? null,
         req.params.id, req.agency.agency_id]
      );
      if (!row) return fail(res, 404, 'Client tidak ditemukan');
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/clients/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM clients WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── ORDERS ────────────────────────────────────────────────────────────────────

function registerOrderRoutes(app) {
  app.get('/api/orders', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM orders WHERE agency_id = $1 ORDER BY created_at DESC`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/orders', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO orders (${b.id ? 'id, ' : ''}agency_id, client_id, type, status, title,
          total_price, cost_price, currency, metadata, trip_id, package_id, jamaah_id,
          created_by_agent, notes, payment_status, paid_amount)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'},
                 ${b.id ? '$8' : '$7'}, ${b.id ? '$9' : '$8'}, ${b.id ? '$10' : '$9'},
                 ${b.id ? '$11' : '$10'}, ${b.id ? '$12' : '$11'}, ${b.id ? '$13' : '$12'},
                 ${b.id ? '$14' : '$13'}, ${b.id ? '$15' : '$14'}, ${b.id ? '$16' : '$15'},
                 ${b.id ? '$17' : '$16'}, ${b.id ? '$18' : '$17'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, b.client_id ?? null, b.type ?? 'umrah',
             b.status ?? 'Draft', b.title ?? null, b.total_price ?? 0, b.cost_price ?? 0,
             b.currency ?? 'IDR', JSON.stringify(b.metadata ?? {}), b.trip_id ?? null,
             b.package_id ?? null, b.jamaah_id ?? null, b.created_by_agent ?? null,
             b.notes ?? null, b.payment_status ?? 'UNPAID', b.paid_amount ?? 0]
          : [req.agency.agency_id, b.client_id ?? null, b.type ?? 'umrah',
             b.status ?? 'Draft', b.title ?? null, b.total_price ?? 0, b.cost_price ?? 0,
             b.currency ?? 'IDR', JSON.stringify(b.metadata ?? {}), b.trip_id ?? null,
             b.package_id ?? null, b.jamaah_id ?? null, b.created_by_agent ?? null,
             b.notes ?? null, b.payment_status ?? 'UNPAID', b.paid_amount ?? 0]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/orders/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `UPDATE orders SET
          client_id = COALESCE($1, client_id), type = COALESCE($2, type),
          status = COALESCE($3, status), title = COALESCE($4, title),
          total_price = COALESCE($5, total_price), cost_price = COALESCE($6, cost_price),
          currency = COALESCE($7, currency),
          metadata = CASE WHEN $8::jsonb IS NOT NULL THEN $8::jsonb ELSE metadata END,
          trip_id = COALESCE($9, trip_id), package_id = COALESCE($10, package_id),
          notes = COALESCE($11, notes), payment_status = COALESCE($12, payment_status),
          paid_amount = COALESCE($13, paid_amount),
          created_by_agent = COALESCE($14, created_by_agent),
          updated_at = NOW()
         WHERE id = $15 AND agency_id = $16
         RETURNING *`,
        [b.client_id ?? null, b.type ?? null, b.status ?? null, b.title ?? null,
         b.total_price ?? null, b.cost_price ?? null, b.currency ?? null,
         b.metadata ? JSON.stringify(b.metadata) : null,
         b.trip_id ?? null, b.package_id ?? null, b.notes ?? null,
         b.payment_status ?? null, b.paid_amount ?? null, b.created_by_agent ?? null,
         req.params.id, req.agency.agency_id]
      );
      if (!row) return fail(res, 404, 'Order tidak ditemukan');
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/orders/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM orders WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PACKAGES ──────────────────────────────────────────────────────────────────

function registerPackageRoutes(app) {
  app.get('/api/packages', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM packages WHERE agency_id = $1 ORDER BY created_at DESC`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/packages', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO packages (${b.id ? 'id, ' : ''}agency_id, name, destination, people, days,
          hpp, total_idr, status, emoji, cover_image, departure_date, return_date,
          airline, hotel_level, notes, facilities)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'},
                 ${b.id ? '$8' : '$7'}, ${b.id ? '$9' : '$8'}, ${b.id ? '$10' : '$9'},
                 ${b.id ? '$11' : '$10'}, ${b.id ? '$12' : '$11'}, ${b.id ? '$13' : '$12'},
                 ${b.id ? '$14' : '$13'}, ${b.id ? '$15' : '$14'}, ${b.id ? '$16' : '$15'},
                 ${b.id ? '$17' : '$16'}, ${b.id ? '$18' : '$17'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, b.name, b.destination ?? '', b.people ?? 1,
             b.days ?? 1, b.hpp ?? 0, b.total_idr ?? 0, b.status ?? 'Draft',
             b.emoji ?? '📦', b.cover_image ?? null, b.departure_date ?? null,
             b.return_date ?? null, b.airline ?? null, b.hotel_level ?? null,
             b.notes ?? null, b.facilities ? JSON.stringify(b.facilities) : null]
          : [req.agency.agency_id, b.name, b.destination ?? '', b.people ?? 1,
             b.days ?? 1, b.hpp ?? 0, b.total_idr ?? 0, b.status ?? 'Draft',
             b.emoji ?? '📦', b.cover_image ?? null, b.departure_date ?? null,
             b.return_date ?? null, b.airline ?? null, b.hotel_level ?? null,
             b.notes ?? null, b.facilities ? JSON.stringify(b.facilities) : null]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/packages/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `UPDATE packages SET
          name = COALESCE($1, name), destination = COALESCE($2, destination),
          people = COALESCE($3, people), days = COALESCE($4, days),
          hpp = COALESCE($5, hpp), total_idr = COALESCE($6, total_idr),
          status = COALESCE($7, status), emoji = COALESCE($8, emoji),
          cover_image = COALESCE($9, cover_image), departure_date = COALESCE($10, departure_date),
          return_date = COALESCE($11, return_date), airline = COALESCE($12, airline),
          hotel_level = COALESCE($13, hotel_level), notes = COALESCE($14, notes),
          facilities = CASE WHEN $15::jsonb IS NOT NULL THEN $15::jsonb ELSE facilities END,
          updated_at = NOW()
         WHERE id = $16 AND agency_id = $17
         RETURNING *`,
        [b.name ?? null, b.destination ?? null, b.people ?? null, b.days ?? null,
         b.hpp ?? null, b.total_idr ?? null, b.status ?? null, b.emoji ?? null,
         b.cover_image ?? null, b.departure_date ?? null, b.return_date ?? null,
         b.airline ?? null, b.hotel_level ?? null, b.notes ?? null,
         b.facilities ? JSON.stringify(b.facilities) : null,
         req.params.id, req.agency.agency_id]
      );
      if (!row) return fail(res, 404, 'Package tidak ditemukan');
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/packages/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM packages WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── TICKET PRICES ─────────────────────────────────────────────────────────────

function registerTicketPriceRoutes(app) {
  app.get('/api/ticket-prices', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM ticket_prices WHERE agency_id = $1 ORDER BY sort_order ASC`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/ticket-prices', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO ticket_prices (${b.id ? 'id, ' : ''}agency_id, airline, airline_code,
          from_code, from_city, to_code, to_city, depart_date, base_price, currency,
          valid_until, notes, is_published, sort_order, flight_number, etd, eta,
          terminal, transit_code, transit_city, transit_duration, baggage_info)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'},
                 ${b.id ? '$8' : '$7'}, ${b.id ? '$9' : '$8'}, ${b.id ? '$10' : '$9'},
                 ${b.id ? '$11' : '$10'}, ${b.id ? '$12' : '$11'}, ${b.id ? '$13' : '$12'},
                 ${b.id ? '$14' : '$13'}, ${b.id ? '$15' : '$14'}, ${b.id ? '$16' : '$15'},
                 ${b.id ? '$17' : '$16'}, ${b.id ? '$18' : '$17'}, ${b.id ? '$19' : '$18'},
                 ${b.id ? '$20' : '$19'}, ${b.id ? '$21' : '$20'}, ${b.id ? '$22' : '$21'},
                 ${b.id ? '$23' : '$22'}, ${b.id ? '$24' : '$23'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, b.airline ?? '', b.airline_code ?? '',
             b.from_code ?? '', b.from_city ?? '', b.to_code ?? '', b.to_city ?? '',
             b.depart_date ?? null, b.base_price ?? 0, b.currency ?? 'IDR',
             b.valid_until ?? null, b.notes ?? null, b.is_published ?? true,
             b.sort_order ?? 0, b.flight_number ?? null, b.etd ?? null, b.eta ?? null,
             b.terminal ?? null, b.transit_code ?? null, b.transit_city ?? null,
             b.transit_duration ?? null, b.baggage_info ?? null]
          : [req.agency.agency_id, b.airline ?? '', b.airline_code ?? '',
             b.from_code ?? '', b.from_city ?? '', b.to_code ?? '', b.to_city ?? '',
             b.depart_date ?? null, b.base_price ?? 0, b.currency ?? 'IDR',
             b.valid_until ?? null, b.notes ?? null, b.is_published ?? true,
             b.sort_order ?? 0, b.flight_number ?? null, b.etd ?? null, b.eta ?? null,
             b.terminal ?? null, b.transit_code ?? null, b.transit_city ?? null,
             b.transit_duration ?? null, b.baggage_info ?? null]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/ticket-prices/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `UPDATE ticket_prices SET
          airline = COALESCE($1, airline), airline_code = COALESCE($2, airline_code),
          from_code = COALESCE($3, from_code), from_city = COALESCE($4, from_city),
          to_code = COALESCE($5, to_code), to_city = COALESCE($6, to_city),
          depart_date = COALESCE($7, depart_date), base_price = COALESCE($8, base_price),
          currency = COALESCE($9, currency), valid_until = COALESCE($10, valid_until),
          notes = COALESCE($11, notes), is_published = COALESCE($12, is_published),
          sort_order = COALESCE($13, sort_order), flight_number = COALESCE($14, flight_number),
          etd = COALESCE($15, etd), eta = COALESCE($16, eta),
          terminal = COALESCE($17, terminal), transit_code = COALESCE($18, transit_code),
          transit_city = COALESCE($19, transit_city),
          transit_duration = COALESCE($20, transit_duration),
          baggage_info = COALESCE($21, baggage_info), updated_at = NOW()
         WHERE id = $22 AND agency_id = $23
         RETURNING *`,
        [b.airline ?? null, b.airline_code ?? null, b.from_code ?? null, b.from_city ?? null,
         b.to_code ?? null, b.to_city ?? null, b.depart_date ?? null, b.base_price ?? null,
         b.currency ?? null, b.valid_until ?? null, b.notes ?? null,
         b.is_published ?? null, b.sort_order ?? null, b.flight_number ?? null,
         b.etd ?? null, b.eta ?? null, b.terminal ?? null, b.transit_code ?? null,
         b.transit_city ?? null, b.transit_duration ?? null, b.baggage_info ?? null,
         req.params.id, req.agency.agency_id]
      );
      if (!row) return fail(res, 404, 'Ticket price tidak ditemukan');
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/ticket-prices/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM ticket_prices WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── TRIPS ─────────────────────────────────────────────────────────────────────

function registerTripRoutes(app) {
  app.get('/api/trips', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM trips WHERE agency_id = $1 ORDER BY created_at DESC`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/trips', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO trips (${b.id ? 'id, ' : ''}agency_id, name, destination, start_date,
          end_date, emoji, cover_image, quota_pax, price_per_pax)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'},
                 ${b.id ? '$8' : '$7'}, ${b.id ? '$9' : '$8'}, ${b.id ? '$10' : '$9'},
                 ${b.id ? '$11' : '$10'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, b.name, b.destination ?? '', b.start_date ?? '',
             b.end_date ?? '', b.emoji ?? '✈️', b.cover_image ?? null,
             b.quota_pax ?? null, b.price_per_pax ?? null]
          : [req.agency.agency_id, b.name, b.destination ?? '', b.start_date ?? '',
             b.end_date ?? '', b.emoji ?? '✈️', b.cover_image ?? null,
             b.quota_pax ?? null, b.price_per_pax ?? null]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/trips/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `UPDATE trips SET
          name = COALESCE($1, name), destination = COALESCE($2, destination),
          start_date = COALESCE($3, start_date), end_date = COALESCE($4, end_date),
          emoji = COALESCE($5, emoji), cover_image = COALESCE($6, cover_image),
          quota_pax = COALESCE($7, quota_pax), price_per_pax = COALESCE($8, price_per_pax)
         WHERE id = $9 AND agency_id = $10
         RETURNING *`,
        [b.name ?? null, b.destination ?? null, b.start_date ?? null, b.end_date ?? null,
         b.emoji ?? null, b.cover_image ?? null, b.quota_pax ?? null, b.price_per_pax ?? null,
         req.params.id, req.agency.agency_id]
      );
      if (!row) return fail(res, 404, 'Trip tidak ditemukan');
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/trips/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM trips WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/trips/:tripId/jamaah', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM jamaah WHERE trip_id = $1 AND agency_id = $2 ORDER BY created_at ASC`,
        [req.params.tripId, req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/jamaah', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM jamaah WHERE agency_id = $1 ORDER BY created_at ASC`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/jamaah', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO jamaah (${b.id ? 'id, ' : ''}agency_id, trip_id, name, phone,
          birth_date, passport_number, passport_expiry, gender, photo_data_url,
          needs_review, booking_code, payment_status)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'},
                 ${b.id ? '$8' : '$7'}, ${b.id ? '$9' : '$8'}, ${b.id ? '$10' : '$9'},
                 ${b.id ? '$11' : '$10'}, ${b.id ? '$12' : '$11'}, ${b.id ? '$13' : '$12'},
                 ${b.id ? '$14' : '$13'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, b.trip_id, b.name, b.phone ?? '',
             b.birth_date ?? '', b.passport_number ?? '', b.passport_expiry ?? null,
             b.gender ?? '', b.photo_data_url ?? null, b.needs_review ?? false,
             b.booking_code ?? null, b.payment_status ?? 'Belum Lunas']
          : [req.agency.agency_id, b.trip_id, b.name, b.phone ?? '',
             b.birth_date ?? '', b.passport_number ?? '', b.passport_expiry ?? null,
             b.gender ?? '', b.photo_data_url ?? null, b.needs_review ?? false,
             b.booking_code ?? null, b.payment_status ?? 'Belum Lunas']
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/jamaah/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `UPDATE jamaah SET
          name = COALESCE($1, name), phone = COALESCE($2, phone),
          birth_date = COALESCE($3, birth_date),
          passport_number = COALESCE($4, passport_number),
          passport_expiry = COALESCE($5, passport_expiry),
          gender = COALESCE($6, gender), photo_data_url = COALESCE($7, photo_data_url),
          needs_review = COALESCE($8, needs_review),
          booking_code = COALESCE($9, booking_code),
          payment_status = COALESCE($10, payment_status)
         WHERE id = $11 AND agency_id = $12
         RETURNING *`,
        [b.name ?? null, b.phone ?? null, b.birth_date ?? null, b.passport_number ?? null,
         b.passport_expiry ?? null, b.gender ?? null, b.photo_data_url ?? null,
         b.needs_review ?? null, b.booking_code ?? null, b.payment_status ?? null,
         req.params.id, req.agency.agency_id]
      );
      if (!row) return fail(res, 404, 'Jamaah tidak ditemukan');
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/jamaah/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM jamaah WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/jamaah/:jamaahId/docs', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM jamaah_docs WHERE jamaah_id = $1 AND agency_id = $2`,
        [req.params.jamaahId, req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/jamaah-docs', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO jamaah_docs (${b.id ? 'id, ' : ''}agency_id, jamaah_id, category,
          label, file_name, file_type, data_url)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'},
                 ${b.id ? '$8' : '$7'}, ${b.id ? '$9' : '$8'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, b.jamaah_id, b.category ?? 'other',
             b.label ?? '', b.file_name ?? '', b.file_type ?? 'image', b.data_url ?? '']
          : [req.agency.agency_id, b.jamaah_id, b.category ?? 'other',
             b.label ?? '', b.file_name ?? '', b.file_type ?? 'image', b.data_url ?? '']
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/jamaah-docs/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM jamaah_docs WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PAYMENTS ──────────────────────────────────────────────────────────────────

function registerPaymentRoutes(app) {
  app.get('/api/payments', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let sql = `SELECT * FROM payments WHERE agency_id = $1`;
      const params = [req.agency.agency_id];
      if (q.jamaah_id) { params.push(q.jamaah_id); sql += ` AND jamaah_id = $${params.length}`; }
      if (q.trip_id)   { params.push(q.trip_id);   sql += ` AND trip_id = $${params.length}`; }
      sql += ' ORDER BY created_at DESC';
      const rows = await query(sql, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/payments', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO payments (${b.id ? 'id, ' : ''}agency_id, jamaah_id, trip_id,
          type, amount, method, paid_at, notes, proof_url)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'},
                 ${b.id ? '$8' : '$7'}, ${b.id ? '$9' : '$8'}, ${b.id ? '$10' : '$9'},
                 ${b.id ? '$11' : '$10'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, b.jamaah_id, b.trip_id ?? null,
             b.type ?? 'other', b.amount ?? 0, b.method ?? '', b.paid_at ?? '',
             b.notes ?? '', b.proof_url ?? null]
          : [req.agency.agency_id, b.jamaah_id, b.trip_id ?? null,
             b.type ?? 'other', b.amount ?? 0, b.method ?? '', b.paid_at ?? '',
             b.notes ?? '', b.proof_url ?? null]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/payments/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `UPDATE payments SET
          type = COALESCE($1, type), amount = COALESCE($2, amount),
          method = COALESCE($3, method), paid_at = COALESCE($4, paid_at),
          notes = COALESCE($5, notes), proof_url = COALESCE($6, proof_url)
         WHERE id = $7 AND agency_id = $8
         RETURNING *`,
        [b.type ?? null, b.amount ?? null, b.method ?? null, b.paid_at ?? null,
         b.notes ?? null, b.proof_url ?? null, req.params.id, req.agency.agency_id]
      );
      if (!row) return fail(res, 404, 'Payment tidak ditemukan');
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/payments/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM payments WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── BC TEMPLATES ─────────────────────────────────────────────────────────────

function registerBcTemplateRoutes(app) {
  app.get('/api/bc-templates', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM bc_templates WHERE agency_id = $1 ORDER BY sort_order ASC`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/bc-templates', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO bc_templates (${b.id ? 'id, ' : ''}agency_id, title, category, body,
          sort_order, created_by)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'},
                 ${b.id ? '$8' : '$7'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, b.title, b.category ?? 'general',
             b.body ?? '', b.sort_order ?? 0, req.user.id]
          : [req.agency.agency_id, b.title, b.category ?? 'general',
             b.body ?? '', b.sort_order ?? 0, req.user.id]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/bc-templates/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `UPDATE bc_templates SET
          title = COALESCE($1, title), category = COALESCE($2, category),
          body = COALESCE($3, body), sort_order = COALESCE($4, sort_order),
          updated_at = NOW()
         WHERE id = $5 AND agency_id = $6
         RETURNING *`,
        [b.title ?? null, b.category ?? null, b.body ?? null, b.sort_order ?? null,
         req.params.id, req.agency.agency_id]
      );
      if (!row) return fail(res, 404, 'Template tidak ditemukan');
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/bc-templates/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM bc_templates WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── AGENCY MEMBERS ────────────────────────────────────────────────────────────

function registerMemberRoutes(app) {
  app.get('/api/agency-members', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT am.user_id, am.role, am.commission_pct, am.created_at, am.phone_wa,
                am.agent_notes, am.agent_status, am.card_back_image_url,
                u.email, u.first_name, u.last_name, u.profile_image_url
         FROM agency_members am
         LEFT JOIN users u ON u.id = am.user_id
         WHERE am.agency_id = $1
         ORDER BY am.created_at ASC`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/agency-members/:userId', requireOwner, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `UPDATE agency_members SET
          role = COALESCE($1, role),
          commission_pct = COALESCE($2, commission_pct),
          phone_wa = COALESCE($3, phone_wa),
          agent_notes = COALESCE($4, agent_notes),
          agent_status = COALESCE($5, agent_status),
          card_back_image_url = COALESCE($6, card_back_image_url)
         WHERE user_id = $7 AND agency_id = $8
         RETURNING *`,
        [b.role ?? null, b.commission_pct ?? null, b.phone_wa ?? null,
         b.agent_notes ?? null, b.agent_status ?? null, b.card_back_image_url ?? null,
         req.params.userId, req.agency.agency_id]
      );
      if (!row) return fail(res, 404, 'Member tidak ditemukan');
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── NOTES ─────────────────────────────────────────────────────────────────────

function registerNoteRoutes(app) {
  app.get('/api/notes', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM notes WHERE agency_id = $1 ORDER BY pinned DESC`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/notes', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const now = Date.now();
      const row = await queryOne(
        `INSERT INTO notes (id, agency_id, title, content, color, pinned, tags, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, content = EXCLUDED.content,
           color = EXCLUDED.color, pinned = EXCLUDED.pinned,
           tags = EXCLUDED.tags, updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [b.id, req.agency.agency_id, b.title ?? '', b.content ?? '',
         b.color ?? 'bg-white border-slate-200', b.pinned ?? false,
         JSON.stringify(b.tags ?? []), b.updated_at ?? now]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/notes/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM notes WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PDF TEMPLATES ─────────────────────────────────────────────────────────────

function registerPdfTemplateRoutes(app) {
  app.get('/api/pdf-templates', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM pdf_templates WHERE agency_id = $1 ORDER BY created_at ASC`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/pdf-templates', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO pdf_templates (id, agency_id, name, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, payload = EXCLUDED.payload
         RETURNING *`,
        [b.id, req.agency.agency_id, b.name ?? '', JSON.stringify(b.payload ?? {})]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/pdf-templates/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM pdf_templates WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── VISA SAVED CALCS ──────────────────────────────────────────────────────────

function registerVisaCalcRoutes(app) {
  app.get('/api/visa-calcs', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM visa_saved_calcs WHERE user_id = $1 AND agency_id = $2 ORDER BY created_at DESC`,
        [req.user.id, req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/visa-calcs', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO visa_saved_calcs (${b.id ? 'id, ' : ''}user_id, agency_id, name,
          visa_type, state)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7::jsonb' : '$6::jsonb'})
         RETURNING *`,
        b.id
          ? [b.id, req.user.id, req.agency.agency_id, b.name, b.visa_type ?? 'voa', JSON.stringify(b.state ?? {})]
          : [req.user.id, req.agency.agency_id, b.name, b.visa_type ?? 'voa', JSON.stringify(b.state ?? {})]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/visa-calcs/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM visa_saved_calcs WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── AGENT POINTS ─────────────────────────────────────────────────────────────

function registerAgentPointRoutes(app) {
  app.get('/api/agent-points', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let sql = `SELECT * FROM agent_points WHERE agency_id = $1`;
      const params = [req.agency.agency_id];
      if (q.agent_id) { params.push(q.agent_id); sql += ` AND agent_id = $${params.length}`; }
      sql += ' ORDER BY awarded_at DESC';
      const rows = await query(sql, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/agent-leaderboard', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT agent_id, SUM(points) AS total_points, COUNT(*) AS order_count
         FROM agent_points WHERE agency_id = $1
         GROUP BY agent_id ORDER BY total_points DESC`,
        [req.agency.agency_id]
      );
      return ok(res, rows.map(r => ({
        agent_id: r.agent_id,
        total_points: Number(r.total_points),
        order_count: Number(r.order_count),
      })));
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── WALLET TRANSACTIONS ───────────────────────────────────────────────────────

function registerWalletRoutes(app) {
  app.get('/api/wallet-transactions', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let sql = `SELECT * FROM agent_wallet_transactions WHERE agency_id = $1`;
      const params = [req.agency.agency_id];
      if (q.agent_id) { params.push(q.agent_id); sql += ` AND agent_id = $${params.length}`; }
      sql += ' ORDER BY created_at DESC';
      const rows = await query(sql, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── MISSIONS ─────────────────────────────────────────────────────────────────

function registerMissionRoutes(app) {
  app.get('/api/missions', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM daily_missions WHERE agency_id = $1 ORDER BY created_at DESC`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/missions', requireOwnerOrStaff, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO daily_missions (${b.id ? 'id, ' : ''}agency_id, title, description,
          reward_points, deadline, created_by)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'},
                 ${b.id ? '$8' : '$7'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, b.title, b.description ?? '', b.reward_points ?? 10, b.deadline, req.user.id]
          : [req.agency.agency_id, b.title, b.description ?? '', b.reward_points ?? 10, b.deadline, req.user.id]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/mission-submissions', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let sql = `SELECT * FROM mission_submissions WHERE agency_id = $1`;
      const params = [req.agency.agency_id];
      if (q.agent_id)   { params.push(q.agent_id);   sql += ` AND agent_id = $${params.length}`; }
      if (q.mission_id) { params.push(q.mission_id); sql += ` AND mission_id = $${params.length}`; }
      sql += ' ORDER BY submitted_at DESC';
      const rows = await query(sql, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/mission-submissions', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO mission_submissions (${b.id ? 'id, ' : ''}agency_id, mission_id, agent_id,
          status, proof_image_url, notes, reward_points)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'},
                 ${b.id ? '$8' : '$7'}, ${b.id ? '$9' : '$8'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, b.mission_id, req.user.id, b.status ?? 'pending',
             b.proof_image_url ?? null, b.notes ?? null, b.reward_points ?? 0]
          : [req.agency.agency_id, b.mission_id, req.user.id, b.status ?? 'pending',
             b.proof_image_url ?? null, b.notes ?? null, b.reward_points ?? 0]
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/mission-submissions/:id', requireOwnerOrStaff, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `UPDATE mission_submissions SET
          status = COALESCE($1, status),
          reward_points = COALESCE($2, reward_points),
          reviewed_at = NOW(), reviewed_by = $3
         WHERE id = $4 AND agency_id = $5
         RETURNING *`,
        [b.status ?? null, b.reward_points ?? null, req.user.id, req.params.id, req.agency.agency_id]
      );
      if (!row) return fail(res, 404, 'Submission tidak ditemukan');
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/reward-redemptions', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let sql = `SELECT * FROM reward_redemptions WHERE agency_id = $1`;
      const params = [req.agency.agency_id];
      if (q.agent_id) { params.push(q.agent_id); sql += ` AND agent_id = $${params.length}`; }
      sql += ' ORDER BY requested_at DESC';
      const rows = await query(sql, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/reward-redemptions', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO reward_redemptions (${b.id ? 'id, ' : ''}agency_id, agent_id, reward_key,
          cost_points, status)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, req.user.id, b.reward_key, b.cost_points ?? 0, b.status ?? 'pending']
          : [req.agency.agency_id, req.user.id, b.reward_key, b.cost_points ?? 0, b.status ?? 'pending']
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────

function registerSettingsRoutes(app) {
  app.get('/api/settings/agency', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT key, value FROM agency_settings WHERE agency_id = $1`,
        [req.agency.agency_id]
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
      await query(
        `INSERT INTO agency_settings (agency_id, key, value, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (agency_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [req.agency.agency_id, key, JSON.stringify(value)]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/settings/user', requireMember, async (req, res) => {
    try {
      const rows = await query(
        `SELECT key, value FROM user_settings WHERE user_id = $1`,
        [req.user.id]
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
      await query(
        `INSERT INTO user_settings (user_id, key, value, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [req.user.id, key, JSON.stringify(value)]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PACKAGE CALCULATIONS ──────────────────────────────────────────────────────

function registerPackageCalcRoutes(app) {
  app.get('/api/package-calculations/:packageId', requireMember, async (req, res) => {
    try {
      const row = await queryOne(
        `SELECT * FROM package_calculations WHERE package_id = $1 AND agency_id = $2`,
        [req.params.packageId, req.agency.agency_id]
      );
      return ok(res, row ?? null);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/package-calculations', requireMember, async (req, res) => {
    try {
      const b = req.body;
      await query(
        `INSERT INTO package_calculations (package_id, agency_id, payload, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (package_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [b.package_id, req.agency.agency_id, JSON.stringify(b.payload ?? {})]
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
      let sql = `SELECT * FROM client_docs WHERE agency_id = $1`;
      const params = [req.agency.agency_id];
      if (q.client_id) { params.push(q.client_id); sql += ` AND client_id = $${params.length}`; }
      sql += ' ORDER BY created_at DESC';
      const rows = await query(sql, params);
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/client-docs', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const row = await queryOne(
        `INSERT INTO client_docs (${b.id ? 'id, ' : ''}agency_id, client_id, category,
          label, file_name, file_type, data_url)
         VALUES (${b.id ? '$1, $2' : '$1'}, ${b.id ? '$3' : '$2'}, ${b.id ? '$4' : '$3'},
                 ${b.id ? '$5' : '$4'}, ${b.id ? '$6' : '$5'}, ${b.id ? '$7' : '$6'},
                 ${b.id ? '$8' : '$7'}, ${b.id ? '$9' : '$8'})
         RETURNING *`,
        b.id
          ? [b.id, req.agency.agency_id, b.client_id, b.category ?? 'other',
             b.label ?? '', b.file_name ?? '', b.file_type ?? 'image', b.data_url ?? '']
          : [req.agency.agency_id, b.client_id, b.category ?? 'other',
             b.label ?? '', b.file_name ?? '', b.file_type ?? 'image', b.data_url ?? '']
      );
      return ok(res, row);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/client-docs/:id', requireMember, async (req, res) => {
    try {
      await query(
        `DELETE FROM client_docs WHERE id = $1 AND agency_id = $2`,
        [req.params.id, req.agency.agency_id]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────

function registerAuditRoutes(app) {
  app.get('/api/audit-log', requireOwnerOrStaff, async (req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM audit_logs WHERE agency_id = $1 ORDER BY created_at DESC LIMIT 500`,
        [req.agency.agency_id]
      );
      return ok(res, rows);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/audit-log', requireMember, async (req, res) => {
    try {
      const b = req.body;
      await query(
        `INSERT INTO audit_logs (agency_id, user_id, table_name, record_id, action, old_data, new_data)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [req.agency.agency_id, req.user.id, b.table_name, b.record_id ?? null,
         b.action, JSON.stringify(b.old_data ?? null), JSON.stringify(b.new_data ?? null)]
      );
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── CARD BACK ────────────────────────────────────────────────────────────────

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
      await query(
        `UPDATE agency_members SET card_back_image_url = $1
         WHERE user_id = $2 AND agency_id = $3`,
        [imageBase64, targetUserId, agencyId]
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
      const row = await queryOne(
        `UPDATE agency_members SET card_back_image_url = $1
         WHERE user_id = $2 AND agency_id = $3
         RETURNING user_id, card_back_image_url`,
        [url, targetUserId, agencyId]
      );
      if (!row) return fail(res, 404, 'User tidak ditemukan di agency ini');
      return ok(res, { ok: true, url: row.card_back_image_url });
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
