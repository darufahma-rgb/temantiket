'use strict';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const SERVICE_ROLE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function makeAdminClient() {
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL tidak dikonfigurasi');
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum di-set');
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

const ROUTE = '[backfill-field-fees]';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

    const caller = await getCallerUser(authHeader);
    if (!caller) return res.status(401).json({ error: 'Sesi tidak valid — login ulang dulu' });

    const admin = makeAdminClient();

    const { data: membership, error: memErr } = await admin
      .from('agency_members').select('agency_id, role').eq('user_id', caller.id).maybeSingle();
    if (memErr || !membership) return res.status(403).json({ error: 'Tidak terdaftar di agency manapun' });
    if (membership.role === 'agent') return res.status(403).json({ error: 'Hanya owner/staff yang dapat melakukan backfill fee' });

    const agencyId = membership.agency_id;
    const { agentId: filterAgentId } = req.body ?? {};
    console.log(`${ROUTE} caller=${caller.id} agency=${agencyId} filter=${filterAgentId ?? 'semua'}`);

    const { data: orders, error: ordersErr } = await admin
      .from('orders')
      .select('id, type, status, metadata, created_by_agent')
      .eq('agency_id', agencyId)
      .eq('status', 'Completed');

    if (ordersErr) return res.status(500).json({ error: ordersErr.message });
    console.log(`${ROUTE} fetched ${orders.length} Completed orders`);

    const results = { credited: 0, skipped: 0, errors: 0 };
    const errorSamples = [];
    const now = new Date().toISOString();

    function collectErr(label, e) {
      results.errors++;
      const msg = e?.message ?? String(e);
      console.error(`${ROUTE} tx error [${label}]:`, msg);
      if (errorSamples.length < 5) errorSamples.push(`[${label}] ${msg}`);
    }

    async function upsertTx(txId, agentId, type, amountIdr, description) {
      try {
        const { error } = await admin.from('agent_wallet_transactions').upsert({
          id:           txId,
          agency_id:    agencyId,
          agent_id:     agentId,
          type,
          points_delta: 0,
          amount_idr:   amountIdr,
          description,
          created_by:   caller.id,
          created_at:   now,
        }, { onConflict: 'id', ignoreDuplicates: true });
        return error ?? null;
      } catch (e) { return e; }
    }

    async function markMeta(orderId, meta, patch) {
      const updated = { ...meta, ...patch };
      await admin.from('orders').update({ metadata: updated }).eq('id', orderId).catch(() => {});
    }

    for (const order of orders) {
      const meta = order.metadata ?? {};
      const oid8 = String(order.id).slice(0, 8);

      const checks = [
        [meta.voaFieldAgentId,       Number(meta.voaAgentFee ?? 0),    'voa_agent_fee',  `Fee Agent Lapangan VOA — order #${oid8}`,       `voa-${order.id}`,        'voaFeeCredited'],
        [meta.fieldAgentId,          Number(meta.fieldAgentFee ?? 0),  'voa_agent_fee',  `Fee Agent Lapangan — order #${oid8}`,           `field-${order.id}`,      'fieldFeeCredited'],
        [meta.visaExecutorId,        Number(meta.executorFee ?? 0),    'pelaksana_fee',  `Fee Pelaksana Visa — order #${oid8}`,           `executor-${order.id}`,   'executorFeeCredited'],
        [meta.assignedOperationalAgentId, Number(meta.operationalAgentFee ?? 0), 'voa_agent_fee', `Fee Agent Operasional — order #${oid8}`, `op-${order.id}`, 'operationalFeeCredited'],
        [order.type === 'visa_student' ? meta.pelaksanaId : null,
          Number(meta.pelaksanaFee ?? (order.type === 'visa_student' && meta.pelaksanaId ? 200000 : 0)),
          'pelaksana_fee', `Fee Pelaksana Visa Student — order #${oid8}`, `pelaksana-${order.id}`, 'pelaksanaFeeCredited'],
        [meta.kurirAgentId,          Number(meta.kurirFee ?? 0),       'kurir_fee',      `Fee Kurir Setoran — order #${oid8}`,            `kurir-${order.id}`,      'kurirFeeCredited'],
        [order.created_by_agent,     Number(meta.agentFee ?? 0),       'order_bonus',    `Komisi Sales ${order.type} — order #${oid8}`,   `agent-${order.id}`,      'agentFeeCredited'],
        [meta.salesAgentId && meta.salesAgentId !== order.created_by_agent ? meta.salesAgentId : null,
          Number(meta.salesCommission ?? meta.agentCommission ?? 0),
          'order_bonus', `Komisi Sales Agent — order #${oid8}`, `salesagent-${order.id}`, null],
        [meta.assignedAgentId,       Number(meta.assignedAgentFee ?? 0), 'voa_agent_fee', `Fee Agent Ditugaskan — order #${oid8}`, `assigned-${order.id}`, null],
        [meta.handlerAgentId,        Number(meta.handlerFee ?? 0),     'voa_agent_fee',  `Fee Handler — order #${oid8}`,                  `handler-${order.id}`,    null],
        [meta.courierAgentId && meta.courierAgentId !== meta.kurirAgentId ? meta.courierAgentId : null,
          Number(meta.courierFee ?? 0),
          'kurir_fee', `Fee Kurir — order #${oid8}`, `courier-${order.id}`, null],
      ];

      for (const [agentId, fee, type, desc, txId, creditedFlag] of checks) {
        if (!agentId || fee <= 0) continue;
        if (filterAgentId && filterAgentId !== agentId) continue;
        const txErr = await upsertTx(txId, agentId, type, fee, desc);
        if (txErr) {
          collectErr(`${txId}`, txErr);
        } else {
          if (creditedFlag && !meta[creditedFlag]) {
            await markMeta(order.id, meta, { [creditedFlag]: true });
          }
          results.credited++;
        }
      }
    }

    const errorSample = errorSamples[0] ?? null;
    console.log(`${ROUTE} DONE — credited=${results.credited} skipped=${results.skipped} errors=${results.errors}`);
    return res.status(200).json({ ok: true, ...results, errorSample });
  } catch (e) {
    console.error(`${ROUTE} unhandled exception:`, e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
}
