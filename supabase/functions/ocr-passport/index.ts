// Edge Function: ocr-passport
// AI OCR untuk paspor — pakai OpenAI gpt-4o-mini (vision).
//
// POST /functions/v1/ocr-passport
// Headers: Authorization: Bearer <user-jwt>
// Body: { imageDataUrl: string }   // data:image/...;base64,...
// Response: { name, passportNumber, nationality, birthDate, expiryDate, gender, mrzValid, source }
//
// Deploy: supabase functions deploy ocr-passport
// Set secret: supabase secrets set OPENAI_API_KEY=sk-...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ── CORS (inlined biar bisa di-deploy via dashboard tanpa folder _shared) ──
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

interface ParsedPassport {
  name: string | null;
  passportNumber: string | null;
  nationality: string | null;
  birthDate: string | null;
  expiryDate: string | null;
  gender: "L" | "P" | null;
  mrzValid: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return jsonResponse({ error: "OPENAI_API_KEY belum di-set di Supabase Functions secrets" }, 500);

    // Auth check — caller harus user yang valid & member di sebuah agency
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return jsonResponse({ error: "Invalid session" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: membership, error: memErr } = await admin
      .from("agency_members").select("agency_id").eq("user_id", callerId).maybeSingle();
    if (memErr || !membership) return jsonResponse({ error: "Tidak terdaftar di agency manapun" }, 403);

    // Body
    const body = await req.json().catch(() => null);
    const imageDataUrl: string | undefined = body?.imageDataUrl;
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return jsonResponse({ error: "imageDataUrl required" }, 400);
    }
    if (!imageDataUrl.startsWith("data:image/")) {
      return jsonResponse({ error: "imageDataUrl must be a data URL (data:image/...;base64,...)" }, 400);
    }
    // Hard limit ~6MB base64 (~4.5MB raw) supaya OpenAI gak nolak / mahal
    if (imageDataUrl.length > 6 * 1024 * 1024) {
      return jsonResponse({ error: "Image terlalu besar (>6MB), tolong di-compress dulu" }, 400);
    }

    // Call OpenAI Chat Completions w/ vision
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Read the MRZ from this passport and return the JSON." },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
            ],
          },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errTxt = await openaiRes.text();
      return jsonResponse({ error: `OpenAI error: ${errTxt.slice(0, 300)}` }, 502);
    }

    const completion = await openaiRes.json();
    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
      return jsonResponse({ error: "OpenAI returned empty response" }, 502);
    }

    let parsed: ParsedPassport;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: "OpenAI returned invalid JSON", raw: raw.slice(0, 300) }, 502);
    }

    // Normalize — strip nulls, sanity-check shapes
    const out: Record<string, unknown> = {};
    if (typeof parsed.name === "string" && parsed.name.trim()) out.name = parsed.name.trim();
    if (typeof parsed.passportNumber === "string" && parsed.passportNumber.trim()) {
      out.passportNumber = parsed.passportNumber.replace(/[<\s]/g, "").toUpperCase();
    }
    if (typeof parsed.nationality === "string" && /^[A-Z]{3}$/.test(parsed.nationality.toUpperCase())) {
      out.nationality = parsed.nationality.toUpperCase();
    }
    if (typeof parsed.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.birthDate)) {
      out.birthDate = parsed.birthDate;
    }
    if (typeof parsed.expiryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiryDate)) {
      out.expiryDate = parsed.expiryDate;
    }
    if (parsed.gender === "L" || parsed.gender === "P") out.gender = parsed.gender;
    out.mrzValid = parsed.mrzValid === true;
    out.source = "openai";

    return jsonResponse(out);
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
