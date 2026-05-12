import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const SERVICE_ROLE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const OPENAI_API_KEY    = (process.env.OPENAI_API_KEY || '').trim();

const BUCKETS_TO_CHECK = ['jamaah-photos', 'jamaah-docs', 'card-backs', 'pdf-templates'];

function makeAdminClient() {
  if (!SUPABASE_URL)      throw new Error('VITE_SUPABASE_URL tidak dikonfigurasi');
  if (!SERVICE_ROLE_KEY)  throw new Error('SUPABASE_SERVICE_ROLE_KEY belum di-set di Vercel Environment Variables.');
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function getCallerUser(authHeader) {
  if (!authHeader || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

// ── Route handlers ─────────────────────────────────────────────────────────────

async function handleHealthCheck(req, res) {
  const provider = (process.env.VERCEL || process.env.VERCEL_ENV) ? 'vercel'
    : (process.env.REPL_ID) ? 'replit' : 'local';
  const result = { ok: true, provider, serviceRole: false, projectUrl: null, database: false, storage: false, bucketStatus: {}, errors: [] };

  if (!SUPABASE_URL) {
    result.ok = false;
    result.errors.push(`VITE_SUPABASE_URL tidak dikonfigurasi.`);
  } else {
    result.projectUrl = SUPABASE_URL;
  }
  if (!SERVICE_ROLE_KEY) {
    result.ok = false;
    result.errors.push(`SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.`);
  } else {
    result.serviceRole = true;
  }
  if (!result.serviceRole || !result.projectUrl) return res.status(503).json(result);

  try {
    const admin = makeAdminClient();
    const { error: dbErr } = await withTimeout(admin.from('agencies').select('id').limit(1), 8000, 'DB');
    if (dbErr) { result.ok = false; result.errors.push(`Database: ${dbErr.message}`); }
    else result.database = true;
  } catch (e) { result.ok = false; result.errors.push(`Database exception: ${e.message}`); }

  try {
    const admin = makeAdminClient();
    const { data: buckets, error: listErr } = await withTimeout(admin.storage.listBuckets(), 8000, 'Storage');
    if (listErr) { result.ok = false; result.errors.push(`Storage: ${listErr.message}`); }
    else {
      const ids = new Set((buckets ?? []).map((b) => b.id));
      let allOk = true;
      for (const name of BUCKETS_TO_CHECK) {
        const exists = ids.has(name);
        result.bucketStatus[name] = exists ? 'ok' : 'missing';
        if (!exists) { allOk = false; result.errors.push(`Bucket '${name}' tidak ditemukan`); }
      }
      result.storage = allOk;
    }
  } catch (e) { result.ok = false; result.errors.push(`Storage exception: ${e.message}`); }

  return res.status(result.ok ? 200 : 503).json(result);
}

async function handleSetupCardBack(req, res) {
  return res.status(200).json({ ok: true, message: 'Storage bucket tidak diperlukan — gambar disimpan di database.' });
}

async function handleBootstrap(req, res) {
  try {
    const { email, password, agencyName, displayName } = req.body || {};
    if (!email || !password || !agencyName) return res.status(400).json({ error: 'email, password, agencyName required' });
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' });

    const admin = makeAdminClient();
    const { count, error: countErr } = await admin.from('agencies').select('*', { count: 'exact', head: true });
    if (countErr) return res.status(500).json({ error: countErr.message });
    if ((count ?? 0) > 0) return res.status(403).json({ error: 'Bootstrap sudah dilakukan. Mintalah owner untuk invite.' });

    const fullName = (displayName ?? '').trim() || email.split('@')[0];
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: fullName },
    });
    if (createErr || !created.user) return res.status(500).json({ error: createErr?.message ?? 'Gagal buat user' });
    const userId = created.user.id;

    const { data: agency, error: agencyErr } = await admin.from('agencies').insert({ name: agencyName, owner_id: userId }).select().single();
    if (agencyErr || !agency) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return res.status(500).json({ error: agencyErr?.message ?? 'Gagal buat agency' });
    }

    const { error: memberErr } = await admin.from('agency_members').insert({ agency_id: agency.id, user_id: userId, role: 'owner' });
    if (memberErr) {
      await admin.from('agencies').delete().eq('id', agency.id);
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return res.status(500).json({ error: memberErr.message });
    }

    await admin.from('profiles').upsert({ id: userId, email, full_name: fullName }, { onConflict: 'id' });
    return res.status(200).json({ ok: true, agencyId: agency.id, userId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handleInviteMember(req, res, admin, caller) {
  try {
    const { data: callerMembership, error: memberErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (memberErr) return res.status(500).json({ error: `DB error: ${memberErr.message}` });
    if (!callerMembership) return res.status(403).json({ error: 'Caller belum ter-link ke agency manapun' });
    if (callerMembership.role !== 'owner') return res.status(403).json({ error: 'Hanya owner yang bisa invite' });

    const { email, password, displayName } = req.body || {};
    const rawRole = req.body?.role;
    const role = rawRole === 'agent' ? 'agent' : rawRole === 'owner' ? 'owner' : 'staff';

    if (!email || !password) return res.status(400).json({ error: 'email & password wajib diisi' });
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter' });

    const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = existingList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) return res.status(409).json({ error: `Email "${email}" sudah terdaftar sebagai user lain` });

    const fullName = (displayName ?? '').trim() || email.split('@')[0];
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: fullName },
    });
    if (createErr || !created.user) return res.status(500).json({ error: `Gagal buat user: ${createErr?.message ?? 'unknown'}` });
    const newUserId = created.user.id;

    const { error: addErr } = await admin.from('agency_members').insert({ agency_id: callerMembership.agency_id, user_id: newUserId, role });
    if (addErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      return res.status(500).json({ error: `Gagal tambah membership: ${addErr.message}` });
    }

    const { error: profileErr } = await admin.from('profiles').upsert({ id: newUserId, email, full_name: fullName }, { onConflict: 'id' });
    if (profileErr) {
      return res.status(200).json({ ok: true, userId: newUserId, email, role, fullName, warning: `User dibuat tapi gagal isi profile: ${profileErr.message}` });
    }
    return res.status(200).json({ ok: true, userId: newUserId, email, role, fullName });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handleRemoveMember(req, res, admin, caller) {
  try {
    const { data: callerMembership, error: memberErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (memberErr || !callerMembership) return res.status(403).json({ error: 'Tidak terdaftar di agency' });
    if (callerMembership.role !== 'owner') return res.status(403).json({ error: 'Hanya owner yang bisa hapus anggota' });

    const { userId } = req.body || {};
    if (!userId || typeof userId !== 'string') return res.status(400).json({ error: 'userId required' });
    if (userId === caller.id) return res.status(400).json({ error: 'Tidak bisa hapus diri sendiri' });

    const { data: target, error: targetErr } = await admin
      .from('agency_members').select('role').eq('agency_id', callerMembership.agency_id).eq('user_id', userId).maybeSingle();
    if (targetErr || !target) return res.status(404).json({ error: 'User tidak ditemukan di agency ini' });
    if (target.role === 'owner') return res.status(400).json({ error: 'Tidak bisa hapus sesama owner' });

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return res.status(500).json({ error: delErr.message });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handleAgencyMembersGet(req, res, admin, caller) {
  try {
    // Use admin client if available; fall back to caller-scoped anon client.
    // This allows the endpoint to work even when SUPABASE_SERVICE_ROLE_KEY is
    // not configured — members are returned without Supabase Auth profile data
    // (email/name) but the membership list itself is always populated.
    const client = admin || createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.authorization } },
      auth: { persistSession: false },
    });

    const { data: callerMember, error: callerErr } = await client
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (callerErr || !callerMember) return res.status(403).json({ error: 'Tidak terdaftar di agency manapun' });

    // Select only columns that are confirmed to exist in agency_members.
    // phone_wa, agent_notes, agent_status are NOT in the Supabase schema —
    // we return safe null defaults for them instead of crashing.
    const { data: members, error: membersErr } = await client
      .from('agency_members')
      .select('user_id, role, commission_pct, created_at, card_back_image_url')
      .eq('agency_id', callerMember.agency_id)
      .order('created_at', { ascending: true });
    if (membersErr) return res.status(500).json({ error: membersErr.message });

    // Enrich with profile data from the profiles table (id, email, full_name, photo_url).
    // Falls back to Supabase Auth admin.listUsers() when admin client is available.
    // Either way, the member list is returned even if profile enrichment fails.
    const memberIds = (members || []).map((m) => m.user_id);
    let profileMap = {};

    // Strategy 1: profiles table (readable with anon key via RLS or admin)
    try {
      const { data: profiles } = await client
        .from('profiles')
        .select('id, email, full_name, photo_url')
        .in('id', memberIds);
      if (profiles && profiles.length > 0) {
        profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
      }
    } catch { /* profiles table may have restrictive RLS — fall through */ }

    // Strategy 2: Supabase Auth admin.listUsers() as supplemental enrichment
    let authUserMap = {};
    if (admin) {
      try {
        const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
        authUserMap = Object.fromEntries((users || []).map((u) => [u.id, u]));
      } catch { /* graceful — admin enrichment is best-effort */ }
    }

    const result = (members || []).map((m) => {
      const profile = profileMap[m.user_id];
      const authUser = authUserMap[m.user_id];
      const meta = authUser?.user_metadata ?? {};

      // Prefer profiles table; fall back to auth user_metadata
      const email = profile?.email ?? authUser?.email ?? null;
      const rawFullName = profile?.full_name ?? meta.full_name ?? meta.display_name ?? '';
      const fullName = rawFullName.trim();
      const photoUrl = profile?.photo_url ?? meta.avatar_url ?? meta.profile_image_url ?? null;

      return {
        user_id: m.user_id,
        role: m.role,
        commission_pct: m.commission_pct ?? 0,
        created_at: m.created_at,
        card_back_image_url: m.card_back_image_url ?? null,
        email,
        first_name: meta.first_name ?? fullName.split(' ')[0] ?? null,
        last_name: meta.last_name ?? fullName.split(' ').slice(1).join(' ') ?? null,
        profile_image_url: photoUrl,
        // Safe null defaults — columns not present in this Supabase schema
        phone_wa: null,
        agent_notes: null,
        agent_status: null,
      };
    });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handleAgencyMembersPut(req, res, admin, caller, targetUserId) {
  try {
    const { data: callerMember, error: callerErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (callerErr || !callerMember) return res.status(403).json({ error: 'Tidak terdaftar di agency manapun' });
    if (callerMember.role !== 'owner') return res.status(403).json({ error: 'Hanya owner yang bisa mengubah data anggota' });
    if (!targetUserId) return res.status(400).json({ error: 'User ID diperlukan' });

    const b = req.body ?? {};
    const updates = {};
    if (b.role              !== undefined) updates.role               = b.role;
    if (b.commission_pct    !== undefined) updates.commission_pct     = b.commission_pct;
    if (b.phone_wa          !== undefined) updates.phone_wa           = b.phone_wa;
    if (b.agent_notes       !== undefined) updates.agent_notes        = b.agent_notes;
    if (b.agent_status      !== undefined) updates.agent_status       = b.agent_status;
    if (b.card_back_image_url !== undefined) updates.card_back_image_url = b.card_back_image_url;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Tidak ada field yang diupdate' });

    const { data, error: updateErr } = await admin
      .from('agency_members').update(updates)
      .eq('user_id', targetUserId).eq('agency_id', callerMember.agency_id)
      .select().maybeSingle();
    if (updateErr) return res.status(500).json({ error: updateErr.message });
    if (!data) return res.status(404).json({ error: 'Member tidak ditemukan' });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handleAwardCompletionPoints(req, res, admin, caller) {
  try {
    const { data: callerMember, error: callerErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (callerErr || !callerMember) return res.status(403).json({ error: 'Tidak terdaftar di agency' });
    if (!['owner', 'staff'].includes(callerMember.role)) return res.status(403).json({ error: 'Hanya owner atau staff yang bisa award poin' });

    const { orderId, agentId } = req.body || {};
    if (!orderId || !agentId) return res.status(400).json({ error: 'orderId dan agentId diperlukan' });

    const { data: targetMember, error: targetErr } = await admin
      .from('agency_members').select('role').eq('user_id', agentId).eq('agency_id', callerMember.agency_id).maybeSingle();
    if (targetErr || !targetMember) return res.status(404).json({ error: 'Agen tidak ditemukan di agency ini' });
    if (targetMember.role !== 'agent') return res.status(200).json({ ok: true, awarded: 0, reason: 'not_agent', role: targetMember.role });

    const { error: insertErr } = await admin.from('agent_points').upsert({
      agency_id: callerMember.agency_id, agent_id: agentId, order_id: orderId,
      points: 20, reason: 'order_completed', awarded_at: new Date().toISOString(),
    }, { onConflict: 'order_id', ignoreDuplicates: true });
    if (insertErr) return res.status(500).json({ error: insertErr.message });
    return res.status(200).json({ ok: true, points: 20 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handleRevokeOrderPoints(req, res, admin, caller) {
  try {
    const { data: callerMember, error: callerErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (callerErr || !callerMember) return res.status(403).json({ error: 'Tidak terdaftar di agency' });
    if (!['owner', 'staff'].includes(callerMember.role)) return res.status(403).json({ error: 'Hanya owner atau staff yang bisa revoke poin' });

    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId diperlukan' });

    const { error: deleteErr } = await admin.from('agent_points').delete()
      .eq('order_id', orderId).eq('agency_id', callerMember.agency_id);
    if (deleteErr) return res.status(500).json({ error: deleteErr.message });
    return res.status(200).json({ ok: true, revoked: orderId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handleCreditWalletTx(req, res, admin, caller) {
  try {
    const { data: membership, error: memErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (memErr || !membership) return res.status(403).json({ error: 'Tidak terdaftar di agency manapun' });

    const { id, agencyId, agentId, type, pointsDelta, amountIDR, description, createdBy, createdAt } = req.body ?? {};
    if (!id || !agencyId || !agentId || !type || amountIDR === undefined) {
      return res.status(400).json({ error: 'Field wajib: id, agencyId, agentId, type, amountIDR' });
    }
    if (membership.agency_id !== agencyId) return res.status(403).json({ error: 'Agency ID tidak sesuai' });
    if (membership.role === 'agent' && agentId !== caller.id) return res.status(403).json({ error: 'Agen hanya bisa mengkreditkan wallet sendiri' });

    const { error: insertErr } = await admin.from('agent_wallet_transactions').upsert({
      id, agency_id: agencyId, agent_id: agentId, type,
      points_delta: pointsDelta ?? 0, amount_idr: amountIDR,
      description: description ?? '', created_by: createdBy ?? caller.id,
      created_at: createdAt ?? new Date().toISOString(),
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (insertErr) return res.status(500).json({ error: insertErr.message });
    return res.status(200).json({ ok: true, id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handleBackfillFieldFees(req, res, admin, caller) {
  const ROUTE = '[backfill-field-fees]';
  try {
    const { data: membership, error: memErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (memErr || !membership) return res.status(403).json({ error: 'Tidak terdaftar di agency manapun' });
    if (membership.role === 'agent') return res.status(403).json({ error: 'Hanya owner/staff yang dapat melakukan backfill fee' });

    const agencyId = membership.agency_id;
    const { agentId: filterAgentId } = req.body ?? {};

    const { data: orders, error: ordersErr } = await admin
      .from('orders').select('id, type, status, metadata, created_by_agent')
      .eq('agency_id', agencyId).eq('status', 'Completed');
    if (ordersErr) return res.status(500).json({ error: ordersErr.message });

    const results = { credited: 0, skipped: 0, errors: 0 };
    const errorSamples = [];
    const now = new Date().toISOString();

    async function upsertTx(txId, agentId, type, amountIdr, description) {
      try {
        const { error } = await admin.from('agent_wallet_transactions').upsert({
          id: txId, agency_id: agencyId, agent_id: agentId, type,
          points_delta: 0, amount_idr: amountIdr, description,
          created_by: caller.id, created_at: now,
        }, { onConflict: 'id', ignoreDuplicates: true });
        return error ?? null;
      } catch (e) { return e; }
    }

    for (const order of orders) {
      const meta = order.metadata ?? {};
      const oid8 = String(order.id).slice(0, 8);
      const checks = [
        [meta.voaFieldAgentId, Number(meta.voaAgentFee ?? 0), 'voa_agent_fee', `Fee Agent Lapangan VOA — order #${oid8}`, `voa-${order.id}`, 'voaFeeCredited'],
        [meta.fieldAgentId, Number(meta.fieldAgentFee ?? 0), 'voa_agent_fee', `Fee Agent Lapangan — order #${oid8}`, `field-${order.id}`, 'fieldFeeCredited'],
        [meta.visaExecutorId, Number(meta.executorFee ?? 0), 'pelaksana_fee', `Fee Pelaksana Visa — order #${oid8}`, `executor-${order.id}`, 'executorFeeCredited'],
        [meta.assignedOperationalAgentId, Number(meta.operationalAgentFee ?? 0), 'voa_agent_fee', `Fee Agent Operasional — order #${oid8}`, `op-${order.id}`, 'operationalFeeCredited'],
        [order.type === 'visa_student' ? meta.pelaksanaId : null, Number(meta.pelaksanaFee ?? (order.type === 'visa_student' && meta.pelaksanaId ? 200000 : 0)), 'pelaksana_fee', `Fee Pelaksana Visa Student — order #${oid8}`, `pelaksana-${order.id}`, 'pelaksanaFeeCredited'],
        [meta.kurirAgentId, Number(meta.kurirFee ?? 0), 'kurir_fee', `Fee Kurir Setoran — order #${oid8}`, `kurir-${order.id}`, 'kurirFeeCredited'],
        [order.created_by_agent, Number(meta.agentFee ?? 0), 'order_bonus', `Komisi Sales ${order.type} — order #${oid8}`, `agent-${order.id}`, 'agentFeeCredited'],
        [meta.salesAgentId && meta.salesAgentId !== order.created_by_agent ? meta.salesAgentId : null, Number(meta.salesCommission ?? meta.agentCommission ?? 0), 'order_bonus', `Komisi Sales Agent — order #${oid8}`, `salesagent-${order.id}`, null],
        [meta.assignedAgentId, Number(meta.assignedAgentFee ?? 0), 'voa_agent_fee', `Fee Agent Ditugaskan — order #${oid8}`, `assigned-${order.id}`, null],
        [meta.handlerAgentId, Number(meta.handlerFee ?? 0), 'voa_agent_fee', `Fee Handler — order #${oid8}`, `handler-${order.id}`, null],
        [meta.courierAgentId && meta.courierAgentId !== meta.kurirAgentId ? meta.courierAgentId : null, Number(meta.courierFee ?? 0), 'kurir_fee', `Fee Kurir — order #${oid8}`, `courier-${order.id}`, null],
      ];
      for (const [agentId, fee, type, desc, txId, creditedFlag] of checks) {
        if (!agentId || fee <= 0) continue;
        if (filterAgentId && filterAgentId !== agentId) continue;
        const txErr = await upsertTx(txId, agentId, type, fee, desc);
        if (txErr) { results.errors++; if (errorSamples.length < 5) errorSamples.push(`[${txId}] ${txErr.message ?? txErr}`); }
        else {
          if (creditedFlag && !meta[creditedFlag]) {
            await admin.from('orders').update({ metadata: { ...meta, [creditedFlag]: true } }).eq('id', order.id).catch(() => {});
          }
          results.credited++;
        }
      }
    }

    console.log(`${ROUTE} DONE — credited=${results.credited} errors=${results.errors}`);
    return res.status(200).json({ ok: true, ...results, errorSample: errorSamples[0] ?? null });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
}

async function handleMigrateProgressSteps(req, res, admin, caller) {
  const ROUTE = '[migrate-progress-steps]';
  const MIGRATIONS = {
    visa_student: { 0: 2, 1: 3, 2: 4, 3: 4, 4: 5 },
    flight:       { 0: 0, 1: 3, 2: 4 },
    visa_voa:     { 0: 2, 1: 3, 2: 3, 3: 4 },
    umrah:        { 0: 0, 1: 2, 2: 3, 3: 4, 4: 5 },
  };
  const NEW_MAX = { visa_student: 5, flight: 4, visa_voa: 4, umrah: 5 };
  try {
    if (caller) {
      const { data: member } = await admin.from('agency_members').select('role').eq('user_id', caller.id).maybeSingle();
      if (member && !['owner', 'staff'].includes(member.role)) return res.status(403).json({ error: 'Hanya owner/staff yang dapat menjalankan migrasi' });
    }

    const { data: orders, error: ordersErr } = await admin.from('orders').select('id, type, metadata').in('type', Object.keys(MIGRATIONS));
    if (ordersErr) return res.status(500).json({ error: ordersErr.message });

    let migrated = 0, skipped = 0, errors = 0;
    const errorSamples = [];
    for (const order of orders) {
      const map = MIGRATIONS[order.type];
      if (!map) { skipped++; continue; }
      const meta = (order.metadata && typeof order.metadata === 'object') ? order.metadata : {};
      if (!('processStep' in meta) || meta.processStep == null) { skipped++; continue; }
      const oldStep = Number(meta.processStep);
      const newMax = NEW_MAX[order.type] ?? 5;
      const oldMaxKey = Math.max(...Object.keys(map).map(Number));
      if (oldStep > oldMaxKey) { skipped++; continue; }
      const newStep = map[oldStep];
      if (newStep === undefined || newStep === oldStep) { skipped++; continue; }
      try {
        const { error: updateErr } = await admin.from('orders').update({ metadata: { ...meta, processStep: Math.min(newStep, newMax) } }).eq('id', order.id);
        if (updateErr) throw updateErr;
        migrated++;
      } catch (e) {
        errors++;
        if (errorSamples.length < 3) errorSamples.push({ id: order.id, error: String(e) });
      }
    }
    console.log(`${ROUTE} DONE — migrated=${migrated} skipped=${skipped} errors=${errors}`);
    return res.status(200).json({ ok: true, migrated, skipped, errors, errorSamples });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
}

const OCR_SYSTEM_PROMPT = `You are an OCR engine specialized in reading the Machine Readable Zone (MRZ) of international passports (ICAO 9303 TD3 format, two lines of 44 characters each).

Look at the bottom of the passport photo for the MRZ strip. Extract EXACTLY these 5 fields and return ONLY a JSON object (no prose, no markdown fences) with this exact shape:

{
  "name": "FULL NAME AS PRINTED (given names then surname, single space separated)",
  "passportNumber": "DOCUMENT NUMBER (alphanumeric, no '<' fillers)",
  "birthDate": "YYYY-MM-DD",
  "gender": "L for male, P for female",
  "expiryDate": "YYYY-MM-DD",
  "mrzValid": true
}

Rules:
- Only return the 5 fields above plus mrzValid. Do not return nationality or any other field.
- If a field is unreadable, set it to null (do NOT guess).
- For 2-digit years in MRZ: if year > 30 it means 19xx, otherwise 20xx for birth date. Expiry is always 20xx.
- Set mrzValid to true only if you successfully read all check digits and they all match.
- gender must be exactly "L" (laki-laki) or "P" (perempuan), null if unreadable.
- Return ONLY the JSON object, nothing else.`;

async function handleAuthUser(req, res, caller, authHeader) {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(503).json({ error: 'Supabase tidak dikonfigurasi' });
    }

    const meta = caller.user_metadata ?? {};
    const fullName = (meta.full_name ?? meta.display_name ?? '').trim();
    const displayName = fullName || caller.email?.split('@')[0] || 'User';

    // ── Step 1: cari membership by Supabase UID (caller.id) ─────────────────
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: memberByUid, error: memErr } = await userClient
      .from('agency_members')
      .select('agency_id, role, commission_pct, agencies(name)')
      .eq('user_id', caller.id)
      .maybeSingle();
    if (memErr) return res.status(500).json({ error: memErr.message });

    if (memberByUid) {
      // Found by current UID — normal happy path
      return res.status(200).json({
        id:              caller.id,
        email:           caller.email ?? '',
        displayName,
        profileImageUrl: meta.avatar_url ?? meta.profile_image_url ?? null,
        role:            memberByUid.role ?? null,
        agencyId:        memberByUid.agency_id ?? null,
        agencyName:      memberByUid.agencies?.name ?? null,
        commissionPct:   Number(memberByUid.commission_pct ?? 0),
      });
    }

    // ── Step 2: tidak ditemukan by UID — coba safe-link by email ────────────
    //
    // Akun lama dibuat via Replit bootstrap dengan user_id berbeda dari
    // Supabase Auth UUID. Cari di profiles/agency_members berdasarkan email,
    // lalu migrate user_id ke Supabase UUID agar akun lama tetap bisa dipakai.

    if (!caller.email) {
      return res.status(404).json({ code: 'NO_MEMBERSHIP', error: 'Tidak ada agency/membership yang terhubung ke akun ini.' });
    }

    if (!SERVICE_ROLE_KEY) {
      return res.status(404).json({
        code: 'NEEDS_SERVICE_ROLE',
        error: 'Akun ditemukan tapi perlu admin migration. Set SUPABASE_SERVICE_ROLE_KEY lalu redeploy.',
      });
    }

    const admin = makeAdminClient();

    // Cari old user_id lewat profiles.email
    const { data: profileByEmail } = await admin
      .from('profiles')
      .select('id')
      .eq('email', caller.email)
      .maybeSingle();

    let oldUserId = profileByEmail?.id ?? null;

    // Fallback: cari langsung di agency_members lewat auth.users email (butuh admin)
    if (!oldUserId) {
      // Cek apakah ada user lain di auth.users dengan email yang sama
      const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const matchUser = authUsers?.users?.find(
        (u) => u.email?.toLowerCase() === caller.email.toLowerCase() && u.id !== caller.id,
      );
      if (matchUser) oldUserId = matchUser.id;
    }

    if (!oldUserId || oldUserId === caller.id) {
      return res.status(404).json({ code: 'NO_MEMBERSHIP', error: 'Tidak ada agency/membership yang terhubung ke akun ini.' });
    }

    // Cek apakah old user punya membership
    const { data: oldMembership } = await admin
      .from('agency_members')
      .select('agency_id, role, commission_pct, agencies(name)')
      .eq('user_id', oldUserId)
      .maybeSingle();

    if (!oldMembership) {
      return res.status(404).json({ code: 'NO_MEMBERSHIP', error: 'Tidak ada agency/membership yang terhubung ke akun ini.' });
    }

    console.log(`[auth/user] Safe-linking legacy account: email=${caller.email}, oldId=${oldUserId}, newId=${caller.id}`);

    // Migrasikan agency_members: update user_id lama ke Supabase UID baru
    const { error: updateErr } = await admin
      .from('agency_members')
      .update({ user_id: caller.id })
      .eq('user_id', oldUserId);

    if (updateErr) {
      console.error('[auth/user] Failed to migrate agency_members:', updateErr.message);
      return res.status(500).json({ error: `Gagal migrasi membership: ${updateErr.message}` });
    }

    // Update / buat profile baru dengan Supabase UID
    await admin.from('profiles').upsert({
      id: caller.id,
      email: caller.email,
      full_name: fullName || caller.email.split('@')[0],
    }, { onConflict: 'id' });

    // Hapus profile lama (jika beda dengan caller.id)
    if (oldUserId !== caller.id) {
      await admin.from('profiles').delete().eq('id', oldUserId);
    }

    console.log(`[auth/user] Migration complete for email=${caller.email}`);

    return res.status(200).json({
      id:              caller.id,
      email:           caller.email ?? '',
      displayName,
      profileImageUrl: meta.avatar_url ?? meta.profile_image_url ?? null,
      role:            oldMembership.role ?? null,
      agencyId:        oldMembership.agency_id ?? null,
      agencyName:      oldMembership.agencies?.name ?? null,
      commissionPct:   Number(oldMembership.commission_pct ?? 0),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handleOcrPassport(req, res, admin, caller) {
  try {
    if (!OPENAI_API_KEY) return res.status(503).json({ error: 'OPENAI_API_KEY belum di-set di Vercel Environment Variables.' });

    const { data: membership, error: memErr } = await admin
      .from('agency_members').select('agency_id').eq('user_id', caller.id).maybeSingle();
    if (memErr || !membership) return res.status(403).json({ error: 'Tidak terdaftar di agency manapun' });

    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== 'string') return res.status(400).json({ error: 'imageDataUrl required' });
    if (!imageDataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'imageDataUrl must be a data URL (data:image/...;base64,...)' });
    if (imageDataUrl.length > 6 * 1024 * 1024) return res.status(400).json({ error: 'Image terlalu besar (>6 MB), tolong di-compress dulu' });

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0, max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: OCR_SYSTEM_PROMPT },
          { role: 'user', content: [
            { type: 'text', text: 'Read the MRZ from this passport and return the JSON.' },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          ]},
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errTxt = await openaiRes.text();
      return res.status(502).json({ error: `OpenAI error: ${errTxt.slice(0, 300)}` });
    }

    const completion = await openaiRes.json();
    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== 'string') return res.status(502).json({ error: 'OpenAI returned empty response' });

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(502).json({ error: 'OpenAI returned invalid JSON', raw: raw.slice(0, 300) }); }

    const out = {};
    if (typeof parsed.name === 'string' && parsed.name.trim()) out.name = parsed.name.trim();
    if (typeof parsed.passportNumber === 'string' && parsed.passportNumber.trim()) out.passportNumber = parsed.passportNumber.replace(/[<\s]/g, '').toUpperCase();
    if (typeof parsed.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.birthDate)) out.birthDate = parsed.birthDate;
    if (typeof parsed.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiryDate)) out.expiryDate = parsed.expiryDate;
    if (parsed.gender === 'L' || parsed.gender === 'P') out.gender = parsed.gender;
    out.mrzValid = parsed.mrzValid === true;
    out.source = 'openai';
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ── Route path extraction ─────────────────────────────────────────────────────
// Vercel catch-all (api/[...path].js) normally populates req.query.path, but
// when cleanUrls:true or certain rewrite configs are active, req.query.path can
// be undefined/empty. Parsing req.url directly is the reliable fallback.
//
// Examples:
//   GET /api/agency-members          → ['agency-members']
//   GET /api/agency-members?foo=bar  → ['agency-members']
//   GET /api/auth/user               → ['auth', 'user']
//   GET /api/health-check            → ['health-check']
//   GET /api/agency-members/abc-123  → ['agency-members', 'abc-123']

function extractPathSegments(req) {
  // 1. Standard Vercel catch-all: req.query.path is string[] of path parts
  const qp = req.query?.path;
  if (Array.isArray(qp) && qp.length > 0 && qp[0]) return qp;
  if (typeof qp === 'string' && qp)                  return qp.split('/').filter(Boolean);

  // 2. Fallback: derive from req.url — works regardless of routing config
  //    req.url in Vercel serverless functions is the full request path, e.g.
  //    "/api/agency-members?foo=bar". We strip /api/ and the query string.
  try {
    const base = new URL(req.url, 'http://x');
    const after = base.pathname.replace(/^\/api(\/|$)/, '');
    const parts = after.split('/').filter(Boolean);
    if (parts.length > 0) return parts;
  } catch { /* ignore malformed URLs */ }

  return [];
}

// ── Main router ────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const segments = extractPathSegments(req);
  const [resource, subId] = segments;

  // ── Public routes (no auth required) ───────────────────────────────────────
  if (resource === 'health-check' && req.method === 'GET') return handleHealthCheck(req, res);
  if (resource === 'setup-card-back' && req.method === 'POST') return handleSetupCardBack(req, res);
  if (resource === 'bootstrap' && req.method === 'POST') return handleBootstrap(req, res);

  // ── Auth-gated routes ───────────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  const caller = await getCallerUser(authHeader);
  if (!caller) return res.status(401).json({ error: 'Sesi tidak valid — login ulang dulu' });

  // auth/user uses its own user-scoped client — no SERVICE_ROLE_KEY needed
  if (resource === 'auth' && subId === 'user' && req.method === 'GET') return handleAuthUser(req, res, caller, authHeader);

  // agency-members GET works without SERVICE_ROLE_KEY (graceful degradation:
  // member list is always returned; profile enrichment is skipped if no admin).
  if (resource === 'agency-members' && req.method === 'GET') {
    let admin = null;
    try { admin = makeAdminClient(); } catch { /* proceed without admin */ }
    return handleAgencyMembersGet(req, res, admin, caller);
  }

  let admin;
  try { admin = makeAdminClient(); }
  catch (e) { return res.status(503).json({ error: e.message }); }

  if (resource === 'agency-members') {
    if (req.method === 'PUT' && subId) return handleAgencyMembersPut(req, res, admin, caller, subId);
  }
  if (resource === 'invite-member'           && req.method === 'POST') return handleInviteMember(req, res, admin, caller);
  if (resource === 'remove-member'           && req.method === 'POST') return handleRemoveMember(req, res, admin, caller);
  if (resource === 'award-completion-points' && req.method === 'POST') return handleAwardCompletionPoints(req, res, admin, caller);
  if (resource === 'revoke-order-points'     && req.method === 'POST') return handleRevokeOrderPoints(req, res, admin, caller);
  if (resource === 'credit-wallet-tx'        && req.method === 'POST') return handleCreditWalletTx(req, res, admin, caller);
  if (resource === 'backfill-field-fees'     && req.method === 'POST') return handleBackfillFieldFees(req, res, admin, caller);
  if (resource === 'migrate-progress-steps'  && req.method === 'POST') return handleMigrateProgressSteps(req, res, admin, caller);
  if (resource === 'ocr-passport'            && req.method === 'POST') return handleOcrPassport(req, res, admin, caller);

  return res.status(404).json({ error: `Route tidak ditemukan: ${req.method} /api/${segments.join('/')}` });
}
