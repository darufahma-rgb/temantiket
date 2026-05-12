const SITE = process.env.SITE;
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

async function read(res) {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

function line(title) {
  console.log("\n" + "=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
}

function short(text, max = 900) {
  return String(text || "").slice(0, max).replace(/\n/g, " ");
}

async function checkRoute(path) {
  const res = await fetch(SITE + path, { redirect: "manual" });
  const body = await read(res);
  console.log(`${path} => ${res.status} | ${res.headers.get("content-type")}`);
  console.log(short(body.text, 220));
  return { path, status: res.status, body };
}

async function main() {
  if (!SITE || !EMAIL || !PASSWORD) {
    console.log('Usage: SITE="https://temantiket.vercel.app" EMAIL="..." PASSWORD="..." node verify-production-fix.js');
    process.exit(1);
  }

  console.log("SITE:", SITE);
  console.log("EMAIL:", EMAIL);

  line("1. CEK ROUTING VERCEL / SPA ROUTES");
  const routeResults = {};
  for (const path of [
    "/",
    "/login",
    "/dashboard",
    "/bootstrap",
    "/orders",
    "/clients",
    "/packages",
    "/ticket-prices",
    "/api/auth/user",
    "/api/agency-members",
    "/api/health-check"
  ]) {
    routeResults[path] = await checkRoute(path);
  }

  line("2. AMBIL SUPABASE ENV DARI BUILD VERCEL");
  const html = await fetch(SITE).then(r => r.text());
  const jsMatch = html.match(/\/assets\/[^"]+\.js/);
  console.log("main js:", jsMatch?.[0] || "NOT FOUND");

  if (!jsMatch) {
    console.log("❌ GAGAL: main JS tidak ditemukan.");
    process.exit(1);
  }

  const js = await fetch(SITE + jsMatch[0]).then(r => r.text());
  const supabaseUrl = js.match(/https:\/\/[a-z0-9.-]+\.supabase\.co/)?.[0];
  const anonKey = js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];

  console.log("Supabase URL:", supabaseUrl || "NOT FOUND");
  console.log("Anon key:", anonKey ? "FOUND" : "NOT FOUND");

  if (!supabaseUrl || !anonKey) {
    console.log("❌ GAGAL: Supabase env tidak kebaca di build Vercel.");
    process.exit(1);
  }

  line("3. TEST LOGIN SUPABASE");
  const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  const tokenBody = await read(tokenRes);
  console.log("Supabase /token status:", tokenRes.status);
  console.log(short(tokenBody.text, 1000));

  if (!tokenBody.json?.access_token) {
    console.log("\n❌ DIAGNOSIS: Login Supabase gagal. Masalah akun/password/Auth.");
    process.exit(1);
  }

  const accessToken = tokenBody.json.access_token;
  const authUserId = tokenBody.json.user?.id;
  console.log("Auth user id:", authUserId);

  line("4. TEST /api/auth/user DENGAN TOKEN");
  const authUserRes = await fetch(`${SITE}/api/auth/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const authUserBody = await read(authUserRes);
  console.log("/api/auth/user status:", authUserRes.status);
  console.log(authUserBody.text);

  const agencyId = authUserBody.json?.agencyId || authUserBody.json?.agency_id;
  console.log("agencyId:", agencyId || "NOT FOUND");

  line("5. TEST /api/agency-members DENGAN TOKEN");
  const memberUrls = [
    `${SITE}/api/agency-members`,
    agencyId ? `${SITE}/api/agency-members?agencyId=${agencyId}` : null,
  ].filter(Boolean);

  let membersOk = false;
  let roleCounts = {};

  for (const url of memberUrls) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await read(res);
    console.log("\nURL:", url.replace(SITE, ""));
    console.log("status:", res.status);
    console.log(short(body.text, 2500));

    if (res.status === 200 && Array.isArray(body.json)) {
      membersOk = true;
      roleCounts = body.json.reduce((acc, m) => {
        const role = m.role || "unknown";
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {});
      console.log("role counts:", roleCounts);
    }
  }

  line("6. CEK DATA LANGSUNG DARI SUPABASE REST");
  async function rest(table, query) {
    const url = `${supabaseUrl}/rest/v1/${table}?${query}`;
    const res = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    const body = await read(res);
    console.log(`\n${table}?${query}`);
    console.log("status:", res.status);
    console.log(short(body.text, 1200));
    return { status: res.status, body };
  }

  if (agencyId) {
    await rest("agency_members", `select=*&agency_id=eq.${agencyId}&limit=20`);
    await rest("profiles", "select=*&limit=20");
    await rest("clients", `select=id,name,agency_id,created_at&agency_id=eq.${agencyId}&limit=5`);
    await rest("orders", `select=id,title,agency_id,status,total_price,created_at&agency_id=eq.${agencyId}&limit=5`);
    await rest("agent_points", `select=*&agency_id=eq.${agencyId}&limit=5`);
  }

  line("7. HASIL AKHIR / DIAGNOSIS");

  const problems = [];

  if (routeResults["/login"].status !== 200) {
    problems.push("❌ /login masih bukan 200. SPA rewrite Vercel belum benar atau deploy belum update.");
  }
  if (routeResults["/dashboard"].status !== 200) {
    problems.push("❌ /dashboard masih bukan 200. Deep route React masih 404.");
  }
  if (routeResults["/bootstrap"].status !== 200) {
    problems.push("❌ /bootstrap masih bukan 200. Deep route React masih 404.");
  }
  if (authUserRes.status !== 200) {
    problems.push(`❌ /api/auth/user dengan token status ${authUserRes.status}. Login profile belum benar.`);
  }
  if (!agencyId) {
    problems.push("❌ /api/auth/user tidak mengembalikan agencyId.");
  }
  if (!membersOk) {
    problems.push("❌ /api/agency-members belum return array 200. Agent/staff UI pasti belum kebaca.");
  } else {
    if (!roleCounts.agent) problems.push("⚠️ /api/agency-members 200 tapi tidak ada role agent.");
    if (!roleCounts.staff) problems.push("⚠️ /api/agency-members 200 tapi tidak ada role staff.");
  }

  if (problems.length === 0) {
    console.log("✅ SEMUA CEK UTAMA LULUS.");
    console.log("Login/profile/API member/routing sudah benar.");
    console.log("Kalau UI masih kosong, masalahnya kemungkinan rendering/filter frontend, bukan API/database.");
  } else {
    console.log("MASALAH YANG MASIH ADA:");
    for (const p of problems) console.log(p);
  }

  console.log("\nTarget ideal:");
  console.log("- /login, /dashboard, /bootstrap => 200 text/html");
  console.log("- /api/auth/user tanpa token => 401 JSON");
  console.log("- /api/auth/user dengan token => 200 JSON + agencyId");
  console.log("- /api/agency-members dengan token => 200 JSON array berisi owner/agent/staff");
}

main().catch(err => {
  console.error("SCRIPT ERROR:", err);
  process.exit(1);
});
