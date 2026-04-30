// Edge Function: invite-member
// Owner invites staff. Buat auth user + tambah agency_members row.
//
// POST /functions/v1/invite-member
// Headers: Authorization: Bearer <user-jwt>
// Body: { email: string, password: string, displayName?: string, role?: 'staff'|'owner' }
//
// Deploy: supabase functions deploy invite-member

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // 1. Validasi env vars dulu — jangan biarkan request setengah jalan ketemu
    //    `null!` di tengah eksekusi.
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anonKey) return jsonResponse({ error: "Konfigurasi server tidak lengkap (SUPABASE_URL/ANON_KEY)" }, 500);
    if (!serviceKey) {
      return jsonResponse({
        error: "SUPABASE_SERVICE_ROLE_KEY belum di-set di Edge Function secrets. Set dulu via dashboard supaya invite bisa jalan.",
      }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization" }, 401);

    // 2. Parse body lebih awal supaya error message lebih clear daripada nanti
    //    kena 'createUser failed' karena body kosong.
    let body: { email?: string; password?: string; displayName?: string; role?: string };
    try { body = await req.json(); } catch { return jsonResponse({ error: "Body bukan JSON valid" }, 400); }
    const { email, password, displayName } = body;
    const role = body.role === "owner" ? "owner" : "staff";
    if (!email || !password) return jsonResponse({ error: "email & password wajib diisi" }, 400);
    if (typeof password !== "string" || password.length < 8) {
      return jsonResponse({ error: "Password minimal 8 karakter" }, 400);
    }

    // 3. Identify caller
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return jsonResponse({ error: "Sesi tidak valid (login ulang)" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 4. Cek caller adalah owner di agency-nya
    const { data: callerMembership, error: memberErr } = await admin
      .from("agency_members").select("agency_id, role").eq("user_id", callerId).maybeSingle();
    if (memberErr) return jsonResponse({ error: `DB error baca membership: ${memberErr.message}` }, 500);
    if (!callerMembership) return jsonResponse({ error: "Caller belum ter-link ke agency manapun" }, 403);
    if (callerMembership.role !== "owner") return jsonResponse({ error: "Hanya owner yang bisa invite staf" }, 403);

    // 5. Cek email belum dipake supaya pesan errornya lebih ramah daripada
    //    'duplicate key' generic dari Postgres.
    const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = existingList?.users?.find((u: { email?: string | null }) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
      return jsonResponse({ error: `Email "${email}" sudah terdaftar sebagai user lain` }, 409);
    }

    // 6. Buat user via auth.admin
    // Trim displayName supaya gak nyimpen whitespace doang sbg nama.
    const fullName = (displayName ?? "").trim() || email.split("@")[0];
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: fullName },
    });
    if (createErr || !created.user) {
      return jsonResponse({ error: `Gagal buat user: ${createErr?.message ?? "unknown"}` }, 500);
    }
    const newUserId = created.user.id;

    // 7. Tambah membership — kalo gagal, rollback auth user supaya gak orphan.
    const { error: addErr } = await admin.from("agency_members").insert({
      agency_id: callerMembership.agency_id, user_id: newUserId, role,
    });
    if (addErr) {
      await admin.auth.admin.deleteUser(newUserId).catch(() => undefined);
      return jsonResponse({ error: `Gagal tambah membership (auth user di-rollback): ${addErr.message}` }, 500);
    }

    // 8. Upsert ke public.profiles supaya UI "Anggota Agency" bisa nge-render
    //    nama beneran (bukan "User <uuid-prefix>"). Pake service role biar
    //    bypass RLS. Kalau gagal, jangan rollback — auth user & membership udah
    //    valid; profile bisa diisi belakangan via update profile sendiri.
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: newUserId,
      email,
      full_name: fullName,
    }, { onConflict: "id" });
    if (profileErr) {
      // Log via response field — UI tetep success, sekedar warning.
      return jsonResponse({
        ok: true, userId: newUserId, email, role, fullName,
        warning: `User dibuat tapi gagal isi profile: ${profileErr.message}. Jalankan migrasi profiles_table.sql.`,
      });
    }

    return jsonResponse({ ok: true, userId: newUserId, email, role, fullName });
  } catch (e) {
    // Hard guard — apapun exception unhandled tetep balik 500 dengan pesan
    // jelas, supaya UI gak stuck "Mengundang…" forever.
    return jsonResponse({ error: `Server error: ${(e as Error).message}` }, 500);
  }
});
