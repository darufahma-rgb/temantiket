'use strict';

const { Pool } = require('pg');

let _pool = null;

function getPool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL belum dikonfigurasi.');
  _pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  return _pool;
}

async function query(sql, params) {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

module.exports = { getPool, query, queryOne };
