// Edge Function: remove-member
// Owner removes staff. Hapus dari agency_members + delete auth user.
//
// POST /functions/v1/remove-member
// Headers: Authorization: Bearer <user-jwt>
// Body: { userId: string }

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
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    const { data: callerMembership, error: memberErr } = await admin
      .from("agency_members").select("agency_id, role").eq("user_id", callerId).maybeSingle();
    if (memberErr || !callerMembership) return jsonResponse({ error: "Tidak terdaftar" }, 403);
    if (callerMembership.role !== "owner") return jsonResponse({ error: "Hanya owner yang bisa hapus" }, 403);

    const { userId } = await req.json();
    if (!userId || typeof userId !== "string") return jsonResponse({ error: "userId required" }, 400);
    if (userId === callerId) return jsonResponse({ error: "Tidak bisa hapus diri sendiri" }, 400);

    // Verify target ada di agency yang sama
    const { data: target, error: targetErr } = await admin
      .from("agency_members").select("role")
      .eq("agency_id", callerMembership.agency_id).eq("user_id", userId).maybeSingle();
    if (targetErr || !target) return jsonResponse({ error: "User tidak ditemukan di agency" }, 404);
    if (target.role === "owner") return jsonResponse({ error: "Tidak bisa hapus owner" }, 400);

    // Hapus auth user (cascade ke agency_members)
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return jsonResponse({ error: delErr.message }, 500);

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
