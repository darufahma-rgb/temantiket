'use strict';

/**
 * db.cjs — SHIM
 * Replit PostgreSQL (DATABASE_URL / pool) sudah dihapus.
 * File ini dipertahankan hanya agar import lama tidak crash.
 * Semua operasi data sekarang melalui Supabase (lihat supabaseAdmin.cjs).
 */

const { getSb } = require('./supabaseAdmin.cjs');

module.exports = { getSb };
