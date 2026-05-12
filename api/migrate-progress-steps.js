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

const ROUTE = '[migrate-progress-steps]';

const MIGRATIONS = {
  visa_student: { 0: 2, 1: 3, 2: 4, 3: 4, 4: 5 },
  flight:       { 0: 0, 1: 3, 2: 4 },
  visa_voa:     { 0: 2, 1: 3, 2: 3, 3: 4 },
  umrah:        { 0: 0, 1: 2, 2: 3, 3: 4, 4: 5 },
};
const NEW_MAX = { visa_student: 5, flight: 4, visa_voa: 4, umrah: 5 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const admin = makeAdminClient();

    const authHeader = req.headers.authorization;
    if (authHeader) {
      const caller = await getCallerUser(authHeader);
      if (caller) {
        const { data: member } = await admin
          .from('agency_members').select('role').eq('user_id', caller.id).maybeSingle();
        if (member && !['owner', 'staff'].includes(member.role)) {
          return res.status(403).json({ error: 'Hanya owner/staff yang dapat menjalankan migrasi' });
        }
      }
    }

    const types = Object.keys(MIGRATIONS);

    const { data: orders, error: ordersErr } = await admin
      .from('orders')
      .select('id, type, metadata')
      .in('type', types);

    if (ordersErr) return res.status(500).json({ error: ordersErr.message });

    let migrated = 0, skipped = 0, errors = 0;
    const errorSamples = [];

    for (const order of orders) {
      const map = MIGRATIONS[order.type];
      if (!map) { skipped++; continue; }
      const meta = (order.metadata && typeof order.metadata === 'object') ? order.metadata : {};
      if (!('processStep' in meta) || meta.processStep == null) { skipped++; continue; }
      const oldStep = Number(meta.processStep);
      const newMax  = NEW_MAX[order.type] ?? 5;
      const oldMaxKey = Math.max(...Object.keys(map).map(Number));
      if (oldStep > oldMaxKey) { skipped++; continue; }
      const newStep = map[oldStep];
      if (newStep === undefined || newStep === oldStep) { skipped++; continue; }
      const clampedStep = Math.min(newStep, newMax);
      try {
        const { error: updateErr } = await admin
          .from('orders')
          .update({ metadata: { ...meta, processStep: clampedStep } })
          .eq('id', order.id);
        if (updateErr) throw updateErr;
        migrated++;
        console.log(`${ROUTE} migrated order ${order.id} type=${order.type} ${oldStep}→${clampedStep}`);
      } catch (e) {
        errors++;
        if (errorSamples.length < 3) errorSamples.push({ id: order.id, error: String(e) });
      }
    }

    console.log(`${ROUTE} DONE — migrated=${migrated} skipped=${skipped} errors=${errors}`);
    return res.status(200).json({ ok: true, migrated, skipped, errors, errorSamples });
  } catch (e) {
    console.error(`${ROUTE} unhandled exception:`, e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal server error' });
  }
}
