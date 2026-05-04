'use strict';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = (process.env.VITE_SUPABASE_URL  || process.env.SUPABASE_URL      || '').trim();
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const SERVICE_ROLE_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const OPENAI_API_KEY    = (process.env.OPENAI_API_KEY || '').trim();

const SYSTEM_PROMPT = `You are an OCR engine specialized in reading the Machine Readable Zone (MRZ) of international passports (ICAO 9303 TD3 format, two lines of 44 characters each).

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

function makeAdminClient() {
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL tidak dikonfigurasi');
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum di-set di Vercel Environment Variables.');
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

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

  try {
    // ── Auth: wajib login ──────────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

    const caller = await getCallerUser(authHeader);
    if (!caller) return res.status(401).json({ error: 'Sesi tidak valid — login ulang dulu' });

    // ── Membership guard: harus terdaftar di sebuah agency ────────────────
    const admin = makeAdminClient();
    const { data: membership, error: memErr } = await admin
      .from('agency_members')
      .select('agency_id')
      .eq('user_id', caller.id)
      .maybeSingle();
    if (memErr || !membership) {
      return res.status(403).json({ error: 'Tidak terdaftar di agency manapun' });
    }

    // ── Validate body ──────────────────────────────────────────────────────
    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return res.status(400).json({ error: 'imageDataUrl required' });
    }
    if (!imageDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'imageDataUrl must be a data URL (data:image/...;base64,...)' });
    }
    if (imageDataUrl.length > 6 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image terlalu besar (>6 MB), tolong di-compress dulu' });
    }

    // ── Call OpenAI vision ─────────────────────────────────────────────────
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Read the MRZ from this passport and return the JSON.' },
              { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
            ],
          },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errTxt = await openaiRes.text();
      return res.status(502).json({ error: `OpenAI error: ${errTxt.slice(0, 300)}` });
    }

    const completion = await openaiRes.json();
    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== 'string') {
      return res.status(502).json({ error: 'OpenAI returned empty response' });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'OpenAI returned invalid JSON', raw: raw.slice(0, 300) });
    }

    // ── Normalize & sanitize output ────────────────────────────────────────
    const out = {};
    if (typeof parsed.name === 'string' && parsed.name.trim()) {
      out.name = parsed.name.trim();
    }
    if (typeof parsed.passportNumber === 'string' && parsed.passportNumber.trim()) {
      out.passportNumber = parsed.passportNumber.replace(/[<\s]/g, '').toUpperCase();
    }
    if (typeof parsed.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.birthDate)) {
      out.birthDate = parsed.birthDate;
    }
    if (typeof parsed.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiryDate)) {
      out.expiryDate = parsed.expiryDate;
    }
    if (parsed.gender === 'L' || parsed.gender === 'P') {
      out.gender = parsed.gender;
    }
    out.mrzValid = parsed.mrzValid === true;
    out.source = 'openai';

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
