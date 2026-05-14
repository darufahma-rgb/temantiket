'use strict';

/**
 * Supabase Admin client — menggantikan Replit PostgreSQL (pool).
 * Menggunakan SUPABASE_SERVICE_ROLE_KEY jika tersedia (bypass RLS),
 * fallback ke VITE_SUPABASE_ANON_KEY jika tidak.
 */

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim();
const SERVICE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const ANON_KEY     = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_KEY = SERVICE_KEY || ANON_KEY;

let _sb = null;

function getSb() {
  if (_sb) return _sb;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      'Supabase belum dikonfigurasi. Pastikan VITE_SUPABASE_URL dan ' +
      'SUPABASE_SERVICE_ROLE_KEY (atau VITE_SUPABASE_ANON_KEY) sudah diset di Secrets.',
    );
  }
  try {
    const { createClient } = require('@supabase/supabase-js');
    _sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return _sb;
  } catch (e) {
    throw new Error(`Gagal inisialisasi Supabase client: ${e.message}`);
  }
}

module.exports = { getSb, SUPABASE_URL, SUPABASE_KEY, SERVICE_KEY, ANON_KEY };
