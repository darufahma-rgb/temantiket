'use strict';

import { createClient } from '@supabase/supabase-js';

const OPENAI_API_KEY    = (process.env.OPENAI_API_KEY || '').trim();
const SUPABASE_URL      = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const OPENAI_BASE_URL  = 'https://api.openai.com/v1';
const MODEL_ASSISTANT  = 'gpt-4o-mini';

async function getCallerUser(authHeader) {
  if (!authHeader || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY belum di-set di Vercel Environment Variables.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const caller = await getCallerUser(authHeader);
  if (!caller) {
    return res.status(401).json({ error: 'Sesi tidak valid — login ulang dulu' });
  }

  try {
    const requestedModel = (req.body && req.body.model) || MODEL_ASSISTANT;

    // Jika model dalam format OpenRouter "provider/model", strip prefix provider-nya.
    // Contoh: "openai/gpt-4o-mini" → "gpt-4o-mini"
    const resolvedModel = (typeof requestedModel === 'string' && requestedModel.includes('/'))
      ? requestedModel.split('/').slice(1).join('/')
      : requestedModel;

    const bodyWithModel = { ...req.body, model: resolvedModel };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(bodyWithModel),
        signal: controller.signal,
      });
      const text = await response.text();
      res.status(response.status).setHeader('Content-Type', 'application/json').send(text);
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        return res.status(504).json({ error: 'AITEM request timeout (90 s) — coba lagi.' });
      }
      throw fetchErr;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
