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

function short(text, max = 1000) {
  return String(text || "").slice(0, max).replace(/\n/g, " ");
}

function section(title) {
  console.log("\n" + "=".repeat(80));
  console.log(title);
  console.log("=".repeat(80));
}

async function route(path) {
  const res = await fetch(SITE + path, { redirect: "manual" });
  const body = await read(res);
  console.log(`${path} => ${res.status} | ${res.headers.get("content-type")}`);
  console.log(short(body.text, 250));
  return { status: res.status, body };
}

async function main() {
  if (!SITE || !EMAIL || !PASSWORD) {
    console.log('Usage: SITE="https://temantiket.vercel.app" EMAIL="..." PASSWORD="..." node verify-production.js');
    process.exit(1);
  }

  console.log("SITE:", SITE);
  console.log("EMAIL:", EMAIL);

  const result = {
    spa: {},
    api: {},
    auth: {},
    members: {},
    data: {},
    problems: [],
  };

  section("1. CEK SPA ROUTES + API ROUTES TANPA TOKEN");

  const paths = [
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
    "/api/health-check",
  ];

  for (const path of paths) {
    const r = await route(path);
    if (path.startsWith("/api/")) result.api[path] = r.status;
    else result.spa[path] = r.status;
  }

  section("2. AMBIL SUPABASE ENV DARI BUILD VERCEL");

  const html = await fetch(SITE).then((r) => r.text());
  const jsMatch = html.match(/\/assets\/[^"]+\.js/);

  console.log("main js:", jsMatch?.[0] || "NOT FOUND");

  if (!jsMatch) {
    result.problems.push("Main JS tidak ditemukan dari index.html.");
    return finish(result);
  }

  const js = await fetch(SITE + jsMatch[0]).then((r) => r.text());
  const supabaseUrl = js.match(/https:\/\/[a-z0-9.-]+\.supabase\.co/)?.[0];
  const anonKey = js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];

  console.log("Supabase URL:", supabaseUrl || "NOT FOUND");
  console.log("Anon key:", anonKey ? "FOUND" : "NOT FOUND");

  if (!supabaseUrl || !anonKey) {
    result.problems.push("Supabase env tidak kebaca di build Vercel.");
    return finish(result);
  }

  section("3. TEST LOGIN SUPABASE");

  const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
    }),
  });

  const tokenBody = await read(tokenRes);
  console.log("Supabase /token status:", tokenRes.status);
  console.log(short(tokenBody.text, 1200));

  result.auth.tokenStatus = tokenRes.status;

  const accessToken = tokenBody.json?.access_token;
  const authUserId = tokenBody.json?.user?.id;

  if (!accessToken) {
    result.problems.push("Login Supabase gagal. Cek akun/password/Supabase Auth.");
    return finish(result);
  }

  console.log("Auth user id:", authUserId);

  section("4. TEST /api/auth/user DENGAN TOKEN");

  const authUserRes = await fetch(`${SITE}/api/auth/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const authUserBody = await read(authUserRes);
  console.log("/api/auth/user status:", authUserRes.status);
  console.log(authUserBody.text);

  result.auth.userStatus = authUserRes.status;

  const agencyId = authUserBody.json?.agencyId || authUserBody.json?.agency_id;
  const role = authUserBody.json?.role;

  console.log("agencyId:", agencyId || "NOT FOUND");
  console.log("role:", role || "NOT FOUND");

  if (!agencyId) {
    result.problems.push("/api/auth/user tidak balikin agencyId.");
    return finish(result);
  }

  section("5. TEST /api/agency-members DENGAN TOKEN");

  const memberEndpoints = [
    "/api/agency-members",
    `/api/agency-members?agencyId=${agencyId}`,
  ];

  let memberArray = null;

  for (const endpoint of memberEndpoints) {
    const res = await fetch(`${SITE}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const body = await read(res);
    console.log("\n" + endpoint);
    console.log("status:", res.status);
    console.log(short(body.text, 2500));

    if (res.status === 200 && Array.isArray(body.json)) {
      memberArray = body.json;
    }
  }

  if (memberArray) {
    const roleCounts = memberArray.reduce((acc, m) => {
      const r = m.role || "unknown";
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});

    console.log("role counts:", roleCounts);

    result.members.ok = true;
    result.members.count = memberArray.length;
    result.members.roleCounts = roleCounts;
  } else {
    result.members.ok = false;
    result.problems.push("/api/agency-members belum return 200 JSON array.");
  }

  section("6. CEK DATA LAMA LANGSUNG DARI SUPABASE REST");

  async function rest(table, query, label) {
    const url = `${supabaseUrl}/rest/v1/${table}?${query}`;
    const res = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    const body = await read(res);
    console.log("\n" + label);
    console.log(`${table}?${query}`);
    console.log("status:", res.status);
    console.log(short(body.text, 1200));

    let count = null;
    if (Array.isArray(body.json)) count = body.json.length;
    result.data[label] = { status: res.status, count };
    return { res, body };
  }

  await rest("agency_members", `select=*&agency_id=eq.${agencyId}&limit=50`, "agency_members");
  await rest("profiles", "select=*&limit=50", "profiles");
  await rest("clients", `select=id,name,agency_id,created_at&agency_id=eq.${agencyId}&limit=10`, "clients");
  await rest("orders", `select=id,title,agency_id,status,total_price,created_at&agency_id=eq.${agencyId}&limit=10`, "orders");
  await rest("agent_points", `select=*&agency_id=eq.${agencyId}&limit=10`, "agent_points");
  await rest("ticket_prices", `select=id,agency_id,airline,from_code,to_code,base_price,is_published&agency_id=eq.${agencyId}&limit=10`, "ticket_prices");

  finish(result);
}

function finish(result) {
  section("7. HASIL AKHIR / DIAGNOSIS");

  for (const [path, status] of Object.entries(result.spa)) {
    if (path === "/" && status !== 200) {
      result.problems.push("/ root bukan 200.");
    }
    if (path !== "/" && status !== 200) {
      result.problems.push(`${path} masih ${status}, harusnya 200 text/html. SPA rewrite Vercel belum benar / deploy belum update.`);
    }
  }

  if (result.api["/api/auth/user"] !== 401) {
    result.problems.push(`/api/auth/user tanpa token status ${result.api["/api/auth/user"]}, idealnya 401 JSON.`);
  }

  if (result.api["/api/agency-members"] !== 401) {
    result.problems.push(`/api/agency-members tanpa token status ${result.api["/api/agency-members"]}, idealnya 401 JSON.`);
  }

  if (result.api["/api/health-check"] !== 200) {
    result.problems.push(`/api/health-check status ${result.api["/api/health-check"]}, harusnya 200 JSON.`);
  }

  if (result.auth.tokenStatus !== 200) {
    result.problems.push("Supabase /token bukan 200.");
  }

  if (result.auth.userStatus !== 200) {
    result.problems.push("/api/auth/user dengan token bukan 200.");
  }

  if (!result.members.ok) {
    result.problems.push("/api/agency-members dengan token belum sukses.");
  } else {
    const rc = result.members.roleCounts || {};
    if (!rc.owner) result.problems.push("agency-members tidak punya owner.");
    if (!rc.agent) result.problems.push("agency-members tidak punya agent.");
    if (!rc.staff) result.problems.push("agency-members tidak punya staff.");
  }

  console.log("Ringkasan:");
  console.log(JSON.stringify({
    spa: result.spa,
    apiWithoutToken: result.api,
    auth: result.auth,
    members: result.members,
    data: result.data,
  }, null, 2));

  if (result.problems.length === 0) {
    console.log("\n✅ SEMUA CEK UTAMA LULUS.");
    console.log("Production routing, login, auth profile, agency-members, dan data lama sudah kebaca.");
  } else {
    console.log("\n❌ MASALAH YANG MASIH ADA:");
    for (const p of result.problems) console.log("- " + p);
  }

  console.log("\nTarget ideal:");
  console.log("- /login, /dashboard, /bootstrap, /orders, /clients, /packages, /ticket-prices => 200 text/html");
  console.log("- /api/auth/user tanpa token => 401 JSON");
  console.log("- /api/agency-members tanpa token => 401 JSON");
  console.log("- /api/health-check => 200 JSON");
  console.log("- Supabase /token => 200");
  console.log("- /api/auth/user dengan token => 200 JSON + agencyId");
  console.log("- /api/agency-members dengan token => 200 JSON array berisi owner/agent/staff");
}

main().catch((err) => {
  console.error("SCRIPT ERROR:", err);
  process.exit(1);
});
