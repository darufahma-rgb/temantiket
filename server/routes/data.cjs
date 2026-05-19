'use strict';

/**
 * data.cjs — Supabase-native CRUD routes
 * Replit PostgreSQL (pool) telah dihapus sepenuhnya.
 * Semua operasi data menggunakan Supabase Admin client.
 */

const { getSb } = require('../supabaseAdmin.cjs');

function ok(res, data) { return res.status(200).json(data); }
function fail(res, code, message) { return res.status(code).json({ error: message }); }

/** Filter null/undefined — used for partial UPDATE (COALESCE equivalent). */
function patch(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}

function resolveUserId(req) {
  return req.user?.id ?? null;
}

/** Get caller agency membership from Supabase. Returns { agency_id, role, commission_pct } or null. */
async function getCallerAgency(req) {
  const userId = resolveUserId(req);
  if (!userId) return null;
  try {
    const { data: rows, error } = await getSb()
      .from('agency_members')
      .select('agency_id, role, commission_pct')
      .eq('user_id', userId)
      .limit(1);
    if (error) { console.warn('[getCallerAgency]', error.message); return null; }
    return rows?.[0] ?? null;
  } catch (e) {
    console.warn('[getCallerAgency]', e.message);
    return null;
  }
}

/** Middleware: require Supabase Bearer JWT + agency membership. */
async function requireMember(req, res, next) {
  const hasBearer = (req.headers['authorization'] ?? '').startsWith('Bearer ');
  if (!hasBearer) return fail(res, 401, 'Unauthorized');
  const agency = await getCallerAgency(req).catch(() => null);
  if (!agency) return fail(res, 403, 'Tidak terdaftar di agency');
  req.agency = agency;
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
      const { data, error } = await getSb()
        .from('clients')
        .select('*')
        .eq('agency_id', req.agency.agency_id)
        .order('created_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/clients/:id', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('clients')
        .select('*')
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id)
        .single();
      if (error || !data) return fail(res, 404, 'Client tidak ditemukan');
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/clients', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:               req.agency.agency_id,
        name:                    b.name,
        phone:                   b.phone ?? '',
        email:                   b.email ?? null,
        birth_date:              b.birth_date ?? null,
        birth_place:             b.birth_place ?? null,
        passport_number:         b.passport_number ?? null,
        passport_expiry:         b.passport_expiry ?? null,
        passport_issue_date:     b.passport_issue_date ?? null,
        passport_issuing_office: b.passport_issuing_office ?? null,
        gender:                  b.gender ?? null,
        photo_data_url:          b.photo_data_url ?? null,
        notes:                   b.notes ?? null,
        legacy_jamaah_id:        b.legacy_jamaah_id ?? null,
        created_by_agent:        b.created_by_agent ?? null,
        referred_by_client_id:   b.referred_by_client_id ?? null,
        referral_stamps:         b.referral_stamps ?? 0,
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('clients').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/clients/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { data, error } = await getSb()
        .from('clients')
        .update(patch({
          name:                    b.name,
          phone:                   b.phone,
          email:                   b.email,
          birth_date:              b.birth_date,
          birth_place:             b.birth_place,
          passport_number:         b.passport_number,
          passport_expiry:         b.passport_expiry,
          passport_issue_date:     b.passport_issue_date,
          passport_issuing_office: b.passport_issuing_office,
          gender:                  b.gender,
          photo_data_url:          b.photo_data_url,
          notes:                   b.notes,
          created_by_agent:        b.created_by_agent,
          referred_by_client_id:   b.referred_by_client_id,
          updated_at:              new Date().toISOString(),
        }))
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id)
        .select()
        .single();
      if (error || !data) return fail(res, 404, 'Client tidak ditemukan');
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/clients/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('clients')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── ORDERS ────────────────────────────────────────────────────────────────────

function registerOrderRoutes(app) {
  app.get('/api/orders', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('orders')
        .select('*')
        .eq('agency_id', req.agency.agency_id)
        .order('created_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/orders', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:        req.agency.agency_id,
        client_id:        b.client_id ?? null,
        type:             b.type ?? 'umrah',
        status:           b.status ?? 'Draft',
        title:            b.title ?? null,
        total_price:      b.total_price ?? 0,
        cost_price:       b.cost_price ?? 0,
        currency:         b.currency ?? 'IDR',
        metadata:         b.metadata ?? {},
        trip_id:          b.trip_id ?? null,
        package_id:       b.package_id ?? null,
        jamaah_id:        b.jamaah_id ?? null,
        created_by_agent: b.created_by_agent ?? null,
        notes:            b.notes ?? null,
        payment_status:   b.payment_status ?? 'UNPAID',
        paid_amount:      b.paid_amount ?? 0,
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('orders').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/orders/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { data, error } = await getSb()
        .from('orders')
        .update(patch({
          client_id:        b.client_id,
          type:             b.type,
          status:           b.status,
          title:            b.title,
          total_price:      b.total_price,
          cost_price:       b.cost_price,
          currency:         b.currency,
          metadata:         b.metadata,
          trip_id:          b.trip_id,
          package_id:       b.package_id,
          notes:            b.notes,
          payment_status:   b.payment_status,
          paid_amount:      b.paid_amount,
          created_by_agent: b.created_by_agent,
          updated_at:       new Date().toISOString(),
        }))
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id)
        .select()
        .single();
      if (error || !data) return fail(res, 404, 'Order tidak ditemukan');
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/orders/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('orders')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PACKAGES ──────────────────────────────────────────────────────────────────

function registerPackageRoutes(app) {
  app.get('/api/packages', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('packages')
        .select('*')
        .eq('agency_id', req.agency.agency_id)
        .order('created_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/packages', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:      req.agency.agency_id,
        name:           b.name,
        destination:    b.destination ?? '',
        people:         b.people ?? 1,
        days:           b.days ?? 1,
        hpp:            b.hpp ?? 0,
        total_idr:      b.total_idr ?? 0,
        status:         b.status ?? 'Draft',
        emoji:          b.emoji ?? '📦',
        cover_image:    b.cover_image ?? null,
        departure_date: b.departure_date ?? null,
        return_date:    b.return_date ?? null,
        airline:        b.airline ?? null,
        hotel_level:    b.hotel_level ?? null,
        notes:          b.notes ?? null,
        facilities:     b.facilities ?? null,
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('packages').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/packages/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { data, error } = await getSb()
        .from('packages')
        .update(patch({
          name:           b.name,
          destination:    b.destination,
          people:         b.people,
          days:           b.days,
          hpp:            b.hpp,
          total_idr:      b.total_idr,
          status:         b.status,
          emoji:          b.emoji,
          cover_image:    b.cover_image,
          departure_date: b.departure_date,
          return_date:    b.return_date,
          airline:        b.airline,
          hotel_level:    b.hotel_level,
          notes:          b.notes,
          facilities:     b.facilities,
          updated_at:     new Date().toISOString(),
        }))
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id)
        .select()
        .single();
      if (error || !data) return fail(res, 404, 'Package tidak ditemukan');
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/packages/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('packages')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── TICKET PRICES ─────────────────────────────────────────────────────────────

function registerTicketPriceRoutes(app) {
  app.get('/api/ticket-prices', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('ticket_prices')
        .select('*')
        .eq('agency_id', req.agency.agency_id)
        .order('sort_order', { ascending: true });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/ticket-prices', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:        req.agency.agency_id,
        airline:          b.airline ?? '',
        airline_code:     b.airline_code ?? '',
        from_code:        b.from_code ?? '',
        from_city:        b.from_city ?? '',
        to_code:          b.to_code ?? '',
        to_city:          b.to_city ?? '',
        depart_date:      b.depart_date ?? null,
        base_price:       b.base_price ?? 0,
        currency:         b.currency ?? 'IDR',
        valid_until:      b.valid_until ?? null,
        notes:            b.notes ?? null,
        is_published:     b.is_published ?? true,
        sort_order:       b.sort_order ?? 0,
        flight_number:    b.flight_number ?? null,
        etd:              b.etd ?? null,
        eta:              b.eta ?? null,
        terminal:         b.terminal ?? null,
        transit_code:     b.transit_code ?? null,
        transit_city:     b.transit_city ?? null,
        transit_duration: b.transit_duration ?? null,
        baggage_info:     b.baggage_info ?? null,
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('ticket_prices').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/ticket-prices/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { data, error } = await getSb()
        .from('ticket_prices')
        .update(patch({
          airline:          b.airline,
          airline_code:     b.airline_code,
          from_code:        b.from_code,
          from_city:        b.from_city,
          to_code:          b.to_code,
          to_city:          b.to_city,
          depart_date:      b.depart_date,
          base_price:       b.base_price,
          currency:         b.currency,
          valid_until:      b.valid_until,
          notes:            b.notes,
          is_published:     b.is_published,
          sort_order:       b.sort_order,
          flight_number:    b.flight_number,
          etd:              b.etd,
          eta:              b.eta,
          terminal:         b.terminal,
          transit_code:     b.transit_code,
          transit_city:     b.transit_city,
          transit_duration: b.transit_duration,
          baggage_info:     b.baggage_info,
          updated_at:       new Date().toISOString(),
        }))
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id)
        .select()
        .single();
      if (error || !data) return fail(res, 404, 'Ticket price tidak ditemukan');
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/ticket-prices/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('ticket_prices')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── TRIPS ─────────────────────────────────────────────────────────────────────

function registerTripRoutes(app) {
  app.get('/api/trips', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('trips')
        .select('*')
        .eq('agency_id', req.agency.agency_id)
        .order('created_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/trips', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:     req.agency.agency_id,
        name:          b.name,
        destination:   b.destination ?? '',
        start_date:    b.start_date ?? '',
        end_date:      b.end_date ?? '',
        emoji:         b.emoji ?? '✈️',
        cover_image:   b.cover_image ?? null,
        quota_pax:     b.quota_pax ?? null,
        price_per_pax: b.price_per_pax ?? null,
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('trips').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/trips/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { data, error } = await getSb()
        .from('trips')
        .update(patch({
          name:          b.name,
          destination:   b.destination,
          start_date:    b.start_date,
          end_date:      b.end_date,
          emoji:         b.emoji,
          cover_image:   b.cover_image,
          quota_pax:     b.quota_pax,
          price_per_pax: b.price_per_pax,
        }))
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id)
        .select()
        .single();
      if (error || !data) return fail(res, 404, 'Trip tidak ditemukan');
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/trips/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('trips')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });

  // ── Jamaah (nested under trip) ────────────────────────────────────────────

  app.get('/api/trips/:tripId/jamaah', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('jamaah')
        .select('*')
        .eq('trip_id', req.params.tripId)
        .eq('agency_id', req.agency.agency_id)
        .order('created_at', { ascending: true });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/jamaah', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('jamaah')
        .select('*')
        .eq('agency_id', req.agency.agency_id)
        .order('created_at', { ascending: true });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/jamaah', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:       req.agency.agency_id,
        trip_id:         b.trip_id,
        name:            b.name,
        phone:           b.phone ?? '',
        birth_date:      b.birth_date ?? '',
        passport_number: b.passport_number ?? '',
        passport_expiry: b.passport_expiry ?? null,
        gender:          b.gender ?? '',
        photo_data_url:  b.photo_data_url ?? null,
        needs_review:    b.needs_review ?? false,
        booking_code:    b.booking_code ?? null,
        payment_status:  b.payment_status ?? 'Belum Lunas',
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('jamaah').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/jamaah/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { data, error } = await getSb()
        .from('jamaah')
        .update(patch({
          name:            b.name,
          phone:           b.phone,
          birth_date:      b.birth_date,
          passport_number: b.passport_number,
          passport_expiry: b.passport_expiry,
          gender:          b.gender,
          photo_data_url:  b.photo_data_url,
          needs_review:    b.needs_review,
          booking_code:    b.booking_code,
          payment_status:  b.payment_status,
        }))
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id)
        .select()
        .single();
      if (error || !data) return fail(res, 404, 'Jamaah tidak ditemukan');
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/jamaah/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('jamaah')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });

  // Jamaah docs
  app.get('/api/jamaah/:jamaahId/docs', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('jamaah_docs')
        .select('*')
        .eq('jamaah_id', req.params.jamaahId)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/jamaah-docs', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:  req.agency.agency_id,
        jamaah_id:  b.jamaah_id,
        category:   b.category ?? 'other',
        label:      b.label ?? '',
        file_name:  b.file_name ?? '',
        file_type:  b.file_type ?? 'image',
        data_url:   b.data_url ?? '',
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('jamaah_docs').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/jamaah-docs/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('jamaah_docs')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PAYMENTS ──────────────────────────────────────────────────────────────────

function registerPaymentRoutes(app) {
  app.get('/api/payments', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = getSb()
        .from('payments')
        .select('*')
        .eq('agency_id', req.agency.agency_id);
      if (q.jamaah_id) query = query.eq('jamaah_id', q.jamaah_id);
      if (q.trip_id)   query = query.eq('trip_id', q.trip_id);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/payments', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:  req.agency.agency_id,
        jamaah_id:  b.jamaah_id,
        trip_id:    b.trip_id ?? null,
        type:       b.type ?? 'other',
        amount:     b.amount ?? 0,
        method:     b.method ?? '',
        paid_at:    b.paid_at ?? '',
        notes:      b.notes ?? '',
        proof_url:  b.proof_url ?? null,
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('payments').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/payments/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { data, error } = await getSb()
        .from('payments')
        .update(patch({
          type:      b.type,
          amount:    b.amount,
          method:    b.method,
          paid_at:   b.paid_at,
          notes:     b.notes,
          proof_url: b.proof_url,
        }))
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id)
        .select()
        .single();
      if (error || !data) return fail(res, 404, 'Payment tidak ditemukan');
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/payments/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('payments')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── BC TEMPLATES ─────────────────────────────────────────────────────────────

function registerBcTemplateRoutes(app) {
  app.get('/api/bc-templates', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('bc_templates')
        .select('*')
        .eq('agency_id', req.agency.agency_id)
        .order('sort_order', { ascending: true });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/bc-templates', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:  req.agency.agency_id,
        title:      b.title,
        category:   b.category ?? 'general',
        body:       b.body ?? '',
        sort_order: b.sort_order ?? 0,
        created_by: req.user.id,
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('bc_templates').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/bc-templates/:id', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { data, error } = await getSb()
        .from('bc_templates')
        .update(patch({
          title:      b.title,
          category:   b.category,
          body:       b.body,
          sort_order: b.sort_order,
          updated_at: new Date().toISOString(),
        }))
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id)
        .select()
        .single();
      if (error || !data) return fail(res, 404, 'Template tidak ditemukan');
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/bc-templates/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('bc_templates')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── AGENCY MEMBERS ────────────────────────────────────────────────────────────

function registerMemberRoutes(app) {
  app.get('/api/agency-members', requireMember, async (req, res) => {
    try {
      const { data: members, error } = await getSb()
        .from('agency_members')
        .select('user_id, role, commission_pct, created_at, phone_wa, agent_notes, agent_status, card_back_image_url')
        .eq('agency_id', req.agency.agency_id)
        .order('created_at', { ascending: true });
      if (error) return fail(res, 500, error.message);

      // Try to enrich with Supabase auth user metadata (requires SERVICE_ROLE_KEY)
      const sb = getSb();
      const enriched = await Promise.all((members ?? []).map(async (m) => {
        let email = null, first_name = null, last_name = null, profile_image_url = null;
        try {
          const { data: { user } } = await sb.auth.admin.getUserById(m.user_id);
          if (user) {
            email = user.email ?? null;
            const fullName = (user.user_metadata?.full_name || user.user_metadata?.name || '');
            const parts = String(fullName).trim().split(' ');
            first_name = parts[0] || null;
            last_name  = parts.slice(1).join(' ') || null;
            profile_image_url = user.user_metadata?.avatar_url ?? null;
          }
        } catch { /* auth.admin not available without SERVICE_ROLE_KEY — that's OK */ }
        return { ...m, email, first_name, last_name, profile_image_url };
      }));

      return ok(res, enriched);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/agency-members/:userId', requireOwner, async (req, res) => {
    try {
      const b = req.body;
      const { data, error } = await getSb()
        .from('agency_members')
        .update(patch({
          role:                b.role,
          commission_pct:      b.commission_pct,
          phone_wa:            b.phone_wa,
          agent_notes:         b.agent_notes,
          agent_status:        b.agent_status,
          card_back_image_url: b.card_back_image_url,
        }))
        .eq('user_id', req.params.userId)
        .eq('agency_id', req.agency.agency_id)
        .select()
        .single();
      if (error || !data) return fail(res, 404, 'Member tidak ditemukan');
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── NOTES ─────────────────────────────────────────────────────────────────────

function registerNoteRoutes(app) {
  app.get('/api/notes', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('notes')
        .select('*')
        .eq('agency_id', req.agency.agency_id)
        .order('pinned', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/notes', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const now = Date.now();
      const { data, error } = await getSb()
        .from('notes')
        .upsert({
          id:         b.id,
          agency_id:  req.agency.agency_id,
          title:      b.title ?? '',
          content:    b.content ?? '',
          color:      b.color ?? 'bg-white border-slate-200',
          pinned:     b.pinned ?? false,
          tags:       b.tags ?? [],
          updated_at: b.updated_at ?? now,
        }, { onConflict: 'id' })
        .select()
        .single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/notes/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('notes')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PDF TEMPLATES ─────────────────────────────────────────────────────────────

function registerPdfTemplateRoutes(app) {
  app.get('/api/pdf-templates', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('pdf_templates')
        .select('*')
        .eq('agency_id', req.agency.agency_id)
        .order('created_at', { ascending: true });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/pdf-templates', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { data, error } = await getSb()
        .from('pdf_templates')
        .upsert({
          id:        b.id,
          agency_id: req.agency.agency_id,
          name:      b.name ?? '',
          payload:   b.payload ?? {},
        }, { onConflict: 'id' })
        .select()
        .single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/pdf-templates/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('pdf_templates')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── VISA SAVED CALCS ──────────────────────────────────────────────────────────

function registerVisaCalcRoutes(app) {
  app.get('/api/visa-calcs', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('visa_saved_calcs')
        .select('*')
        .eq('user_id', req.user.id)
        .eq('agency_id', req.agency.agency_id)
        .order('created_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/visa-calcs', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        user_id:    req.user.id,
        agency_id:  req.agency.agency_id,
        name:       b.name,
        visa_type:  b.visa_type ?? 'voa',
        state:      b.state ?? {},
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('visa_saved_calcs').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/visa-calcs/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('visa_saved_calcs')
        .delete()
        .eq('id', req.params.id)
        .eq('user_id', req.user.id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── AGENT POINTS ─────────────────────────────────────────────────────────────

function registerAgentPointRoutes(app) {
  app.get('/api/agent-points', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = getSb()
        .from('agent_points')
        .select('*')
        .eq('agency_id', req.agency.agency_id);
      if (q.agent_id) query = query.eq('agent_id', q.agent_id);
      const { data, error } = await query.order('awarded_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/agent-leaderboard', requireMember, async (req, res) => {
    try {
      // Supabase doesn't support aggregate queries via PostgREST natively;
      // fetch all records and aggregate in JS
      const { data, error } = await getSb()
        .from('agent_points')
        .select('agent_id, points')
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      const map = new Map();
      for (const row of (data ?? [])) {
        const existing = map.get(row.agent_id) ?? { agent_id: row.agent_id, total_points: 0, order_count: 0 };
        existing.total_points += Number(row.points ?? 0);
        existing.order_count  += 1;
        map.set(row.agent_id, existing);
      }
      const leaderboard = [...map.values()].sort((a, b) => b.total_points - a.total_points);
      return ok(res, leaderboard);
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── WALLET TRANSACTIONS ───────────────────────────────────────────────────────

function registerWalletRoutes(app) {
  app.get('/api/wallet-transactions', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = getSb()
        .from('agent_wallet_transactions')
        .select('*')
        .eq('agency_id', req.agency.agency_id);
      if (q.agent_id) query = query.eq('agent_id', q.agent_id);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── MISSIONS ─────────────────────────────────────────────────────────────────

function registerMissionRoutes(app) {
  app.get('/api/missions', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('daily_missions')
        .select('*')
        .eq('agency_id', req.agency.agency_id)
        .order('created_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/missions', requireOwnerOrStaff, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:      req.agency.agency_id,
        title:          b.title,
        description:    b.description ?? '',
        reward_points:  b.reward_points ?? 10,
        deadline:       b.deadline,
        created_by:     req.user.id,
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('daily_missions').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/mission-submissions', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = getSb()
        .from('mission_submissions')
        .select('*')
        .eq('agency_id', req.agency.agency_id);
      if (q.agent_id)   query = query.eq('agent_id', q.agent_id);
      if (q.mission_id) query = query.eq('mission_id', q.mission_id);
      const { data, error } = await query.order('submitted_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/mission-submissions', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:       req.agency.agency_id,
        mission_id:      b.mission_id,
        agent_id:        req.user.id,
        status:          b.status ?? 'pending',
        proof_image_url: b.proof_image_url ?? null,
        notes:           b.notes ?? null,
        reward_points:   b.reward_points ?? 0,
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('mission_submissions').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.put('/api/mission-submissions/:id', requireOwnerOrStaff, async (req, res) => {
    try {
      const b = req.body;
      const { data, error } = await getSb()
        .from('mission_submissions')
        .update(patch({
          status:        b.status,
          reward_points: b.reward_points,
          reviewed_at:   new Date().toISOString(),
          reviewed_by:   req.user.id,
        }))
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id)
        .select()
        .single();
      if (error || !data) return fail(res, 404, 'Submission tidak ditemukan');
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/reward-redemptions', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = getSb()
        .from('reward_redemptions')
        .select('*')
        .eq('agency_id', req.agency.agency_id);
      if (q.agent_id) query = query.eq('agent_id', q.agent_id);
      const { data, error } = await query.order('requested_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/reward-redemptions', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:    req.agency.agency_id,
        agent_id:     req.user.id,
        reward_key:   b.reward_key,
        cost_points:  b.cost_points ?? 0,
        status:       b.status ?? 'pending',
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('reward_redemptions').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────

function registerSettingsRoutes(app) {
  app.get('/api/settings/agency', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('agency_settings')
        .select('key, value')
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      const settings = {};
      for (const r of (data ?? [])) settings[r.key] = r.value;
      return ok(res, settings);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/settings/agency', requireMember, async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key) return fail(res, 400, 'key required');
      const { error } = await getSb()
        .from('agency_settings')
        .upsert({
          agency_id:  req.agency.agency_id,
          key,
          value,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'agency_id,key' });
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.get('/api/settings/user', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('user_settings')
        .select('key, value')
        .eq('user_id', req.user.id);
      if (error) return fail(res, 500, error.message);
      const settings = {};
      for (const r of (data ?? [])) settings[r.key] = r.value;
      return ok(res, settings);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/settings/user', requireMember, async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key) return fail(res, 400, 'key required');
      const { error } = await getSb()
        .from('user_settings')
        .upsert({
          user_id:    req.user.id,
          key,
          value,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,key' });
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── PACKAGE CALCULATIONS ──────────────────────────────────────────────────────

function registerPackageCalcRoutes(app) {
  app.get('/api/package-calculations/:packageId', requireMember, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('package_calculations')
        .select('*')
        .eq('package_id', req.params.packageId)
        .eq('agency_id', req.agency.agency_id)
        .single();
      if (error && error.code !== 'PGRST116') return fail(res, 500, error.message);
      return ok(res, data ?? null);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/package-calculations', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { error } = await getSb()
        .from('package_calculations')
        .upsert({
          package_id: b.package_id,
          agency_id:  req.agency.agency_id,
          payload:    b.payload ?? {},
          updated_at: new Date().toISOString(),
        }, { onConflict: 'package_id' });
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── CLIENT DOCS ───────────────────────────────────────────────────────────────

function registerClientDocRoutes(app) {
  app.get('/api/client-docs', requireMember, async (req, res) => {
    try {
      const q = req.query;
      let query = getSb()
        .from('client_docs')
        .select('*')
        .eq('agency_id', req.agency.agency_id);
      if (q.client_id) query = query.eq('client_id', q.client_id);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/client-docs', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const payload = {
        agency_id:  req.agency.agency_id,
        client_id:  b.client_id,
        category:   b.category ?? 'other',
        label:      b.label ?? '',
        file_name:  b.file_name ?? '',
        file_type:  b.file_type ?? 'image',
        data_url:   b.data_url ?? '',
      };
      if (b.id) payload.id = b.id;
      const { data, error } = await getSb().from('client_docs').insert(payload).select().single();
      if (error) return fail(res, 500, error.message);
      return ok(res, data);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.delete('/api/client-docs/:id', requireMember, async (req, res) => {
    try {
      const { error } = await getSb()
        .from('client_docs')
        .delete()
        .eq('id', req.params.id)
        .eq('agency_id', req.agency.agency_id);
      if (error) return fail(res, 500, error.message);
      return ok(res, { ok: true });
    } catch (e) { return fail(res, 500, e.message); }
  });
}

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────

function registerAuditRoutes(app) {
  app.get('/api/audit-log', requireOwnerOrStaff, async (req, res) => {
    try {
      const { data, error } = await getSb()
        .from('audit_logs')
        .select('*')
        .eq('agency_id', req.agency.agency_id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) return fail(res, 500, error.message);
      return ok(res, data ?? []);
    } catch (e) { return fail(res, 500, e.message); }
  });

  app.post('/api/audit-log', requireMember, async (req, res) => {
    try {
      const b = req.body;
      const { error } = await getSb()
        .from('audit_logs')
        .insert({
          agency_id:  req.agency.agency_id,
          user_id:    req.user.id,
          table_name: b.table_name,
          record_id:  b.record_id ?? null,
          action:     b.action,
          old_data:   b.old_data ?? null,
          new_data:   b.new_data ?? null,
        });
      if (error) return fail(res, 500, error.message);
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
      const { error } = await getSb()
        .from('agency_members')
        .update({ card_back_image_url: imageBase64 })
        .eq('user_id', targetUserId)
        .eq('agency_id', agencyId);
      if (error) return fail(res, 500, error.message);
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
      const { data, error } = await getSb()
        .from('agency_members')
        .update({ card_back_image_url: url })
        .eq('user_id', targetUserId)
        .eq('agency_id', agencyId)
        .select('user_id, card_back_image_url')
        .single();
      if (error || !data) return fail(res, 404, 'User tidak ditemukan di agency ini');
      return ok(res, { ok: true, url: data.card_back_image_url });
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
