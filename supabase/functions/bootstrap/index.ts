// Edge Function: bootstrap
// One-time setup: bikin auth user pertama + agency + owner membership.
// Refuses kalo udah ada agency.
//
// POST /functions/v1/bootstrap
// Body: { email: string, password: string, agencyName: string, displayName?: string }
//
// Deploy: supabase functions deploy bootstrap --no-verify-jwt

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
    const { email, password, agencyName, displayName } = await req.json();
    if (!email || !password || !agencyName) {
      return jsonResponse({ error: "email, password, agencyName required" }, 400);
    }
    if (typeof password !== "string" || password.length < 8) {
      return jsonResponse({ error: "Password minimal 8 karakter" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Refuse kalo udah ada agency
    const { count, error: countErr } = await admin
      .from("agencies").select("*", { count: "exact", head: true });
    if (countErr) return jsonResponse({ error: countErr.message }, 500);
    if ((count ?? 0) > 0) {
      return jsonResponse({ error: "Bootstrap sudah dilakukan. Mintalah owner untuk invite." }, 403);
    }

    // Buat auth user
    const fullName = (displayName ?? "").trim() || email.split("@")[0];
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: fullName },
    });
    if (createErr || !created.user) return jsonResponse({ error: createErr?.message ?? "Gagal buat user" }, 500);
    const userId = created.user.id;

    // Buat agency
    const { data: agency, error: agencyErr } = await admin
      .from("agencies").insert({ name: agencyName, owner_id: userId }).select().single();
    if (agencyErr || !agency) {
      // Rollback user
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: agencyErr?.message ?? "Gagal buat agency" }, 500);
    }

    // Tambah membership owner
    const { error: memberErr } = await admin.from("agency_members").insert({
      agency_id: agency.id, user_id: userId, role: "owner",
    });
    if (memberErr) {
      await admin.from("agencies").delete().eq("id", agency.id);
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: memberErr.message }, 500);
    }

    // Upsert profile supaya UI Manajemen Tim tampil nama beneran. Kalo gagal,
    // jangan rollback — bootstrap udah sukses, profile bisa disinkronin nanti.
    await admin.from("profiles").upsert({
      id: userId, email, full_name: fullName,
    }, { onConflict: "id" }).then(({ error }) => {
      if (error) console.warn("[bootstrap] profile upsert failed:", error.message);
    });

    return jsonResponse({ ok: true, agencyId: agency.id, userId });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
