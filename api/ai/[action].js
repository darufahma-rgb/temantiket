import { createClient } from '@supabase/supabase-js';

const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const OPENAI_API_KEY     = (process.env.OPENAI_API_KEY || '').trim();
const SUPABASE_URL       = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY  = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENAI_BASE_URL     = 'https://api.openai.com/v1';
const MODEL_ASSISTANT     = 'openai/gpt-4o-mini';

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

// ── /api/ai/chat — OpenRouter proxy ───────────────────────────────────────────
async function handleChat(req, res, caller) {
  if (!OPENROUTER_API_KEY) return res.status(503).json({ error: 'OPENROUTER_API_KEY belum di-set di Vercel Environment Variables.' });
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://temantiket.vercel.app',
        'X-Title': 'Temantiket',
      },
      body: JSON.stringify(req.body),
    });
    const text = await response.text();
    res.status(response.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── /api/ai/assistant — OpenRouter proxy (AITEM) ──────────────────────────────
async function handleAssistant(req, res, caller) {
  if (!OPENROUTER_API_KEY) return res.status(503).json({ error: 'OPENROUTER_API_KEY belum di-set di Vercel Environment Variables.' });
  try {
    const requestedModel = (req.body && req.body.model) || MODEL_ASSISTANT;
    const resolvedModel = (typeof requestedModel === 'string' && !requestedModel.includes('/'))
      ? `openai/${requestedModel}`
      : requestedModel;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://temantiket.vercel.app',
          'X-Title': 'Temantiket',
        },
        body: JSON.stringify({ ...req.body, model: resolvedModel }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        return res.status(503).json({ error: 'API key OpenRouter tidak valid. Periksa OPENROUTER_API_KEY di Vercel Environment Variables.' });
      }
      const text = await response.text();
      res.status(response.status).setHeader('Content-Type', 'application/json').send(text);
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') return res.status(504).json({ error: 'AITEM request timeout (90s) — coba lagi.' });
      throw fetchErr;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Main router ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // req.query.action — set by Vercel file-system routing (api/ai/[action].js)
  // req.query.path   — set when vercel.json rewrite uses ":path*" as capture name
  // URL fallback     — last segment of pathname, works regardless of routing config
  const _qpath = req.query.path;
  const action = req.query.action
    ?? (Array.isArray(_qpath) ? _qpath[0] : _qpath)
    ?? (() => { try { return new URL(req.url, 'http://x').pathname.split('/').filter(Boolean).pop(); } catch { return undefined; } })();

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  const caller = await getCallerUser(authHeader);
  if (!caller) return res.status(401).json({ error: 'Sesi tidak valid — login ulang dulu' });

  if (action === 'chat')      return handleChat(req, res, caller);
  if (action === 'assistant') return handleAssistant(req, res, caller);

  return res.status(404).json({ error: `Unknown AI action: ${action}` });
}
