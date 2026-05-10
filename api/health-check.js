'use strict';

/**
 * Vercel Serverless Function: GET /api/health-check
 *
 * Provider-agnostic health check — detects Vercel / Replit / Local
 * and validates Supabase config, database connectivity, and storage buckets.
 *
 * Response shape:
 * {
 *   ok, provider, serviceRole, projectUrl,
 *   database, storage, bucketStatus, errors
 * }
 */

import { createClient } from '@supabase/supabase-js';

// ── Env vars — support both VITE_ prefix (Replit/Vite) and plain (Vercel) ──
const SUPABASE_URL     = (process.env.VITE_SUPABASE_URL      || process.env.SUPABASE_URL      || '').trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const BUCKETS_TO_CHECK = ['jamaah-photos', 'jamaah-docs', 'card-backs', 'pdf-templates'];

// ── Detect deployment provider ────────────────────────────────────────────────
function detectProvider() {
  if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL) return 'vercel';
  if (process.env.REPL_ID || process.env.REPLIT_DB_URL || process.env.REPL_SLUG) return 'replit';
  return 'local';
}

function envLabel(provider) {
  if (provider === 'vercel')  return 'Vercel Environment Variables';
  if (provider === 'replit')  return 'Replit Secrets';
  return 'environment variables (.env)';
}

function makeAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out setelah ${ms}ms`)), ms)
    ),
  ]);
}

// ── Vercel handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const provider = detectProvider();
  const label    = envLabel(provider);

  const result = {
    ok:           true,
    provider,
    serviceRole:  false,
    projectUrl:   null,
    database:     false,
    storage:      false,
    bucketStatus: {},
    errors:       [],
  };

  // ── 1. Environment / config check ──────────────────────────────────────────
  if (!SUPABASE_URL) {
    result.ok = false;
    result.errors.push(`VITE_SUPABASE_URL tidak dikonfigurasi di ${label}.`);
  } else {
    result.projectUrl = SUPABASE_URL;
  }

  if (!SERVICE_ROLE_KEY) {
    result.ok = false;
    result.errors.push(`SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di ${label}.`);
  } else {
    result.serviceRole = true;
  }

  if (!result.serviceRole || !result.projectUrl) {
    return res.status(503).json(result);
  }

  // ── 2. Database connectivity check ─────────────────────────────────────────
  try {
    const admin = makeAdminClient();
    const { error: dbErr } = await withTimeout(
      admin.from('agencies').select('id').limit(1),
      8000, 'DB health check'
    );
    if (dbErr) {
      result.ok = false;
      result.errors.push(`Database tidak bisa diakses: ${dbErr.message}`);
    } else {
      result.database = true;
    }
  } catch (e) {
    result.ok = false;
    result.errors.push(`Database exception: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 3. Storage bucket check ─────────────────────────────────────────────────
  try {
    const admin = makeAdminClient();
    const { data: buckets, error: listErr } = await withTimeout(
      admin.storage.listBuckets(),
      8000, 'Storage health check'
    );
    if (listErr) {
      result.ok = false;
      result.errors.push(`Storage tidak bisa diakses: ${listErr.message}`);
    } else {
      const bucketIds = new Set((buckets ?? []).map((b) => b.id));
      let allOk = true;
      for (const name of BUCKETS_TO_CHECK) {
        const exists = bucketIds.has(name);
        result.bucketStatus[name] = exists ? 'ok' : 'missing';
        if (!exists) {
          allOk = false;
          result.errors.push(`Bucket '${name}' tidak ditemukan — buat di Supabase Storage dashboard`);
        }
      }
      result.storage = allOk;
    }
  } catch (e) {
    result.ok = false;
    result.errors.push(`Storage exception: ${e instanceof Error ? e.message : String(e)}`);
  }

  return res.status(result.ok ? 200 : 503).json(result);
}
