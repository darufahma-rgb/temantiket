const SITE = process.env.SITE;
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

async function readText(res) {
  const text = await res.text();
  try { return { text, json: JSON.parse(text) }; }
  catch { return { text, json: null }; }
}

function short(text, n = 1000) {
  return String(text || "").slice(0, n).replace(/\n/g, " ");
}

async function rest(supabaseUrl, anonKey, token, table, query = "select=*&limit=5") {
  const url = `${supabaseUrl}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = await readText(res);
  return { table, status: res.status, body };
}

async function countTable(supabaseUrl, anonKey, token, table, agencyId) {
  const queries = [
    { label: "visible_any", query: "select=*&limit=5" },
    { label: "count_any", query: "select=*&limit=1" },
    { label: "by_agency_id", query: `select=*&agency_id=eq.${agencyId}&limit=5` },
  ];

  console.log(`\n--- TABLE ${table} ---`);
  for (const q of queries) {
    const r = await rest(supabaseUrl, anonKey, token, table, q.query);
    console.log(`${q.label}: status=${r.status}`);
    console.log(short(r.body.text, 700));
  }
}

async function main() {
  if (!SITE || !EMAIL || !PASSWORD) {
    console.log('Usage: SITE="https://temantiket.vercel.app" EMAIL="..." PASSWORD="..." node diagnose-owner-dashboard.js');
    process.exit(1);
  }

  console.log("=== OWNER DASHBOARD DATA DIAGNOSIS ===");
  console.log("SITE:", SITE);
  console.log("EMAIL:", EMAIL);

  console.log("\n=== 1. Route check ===");
  for (const path of ["/", "/login", "/dashboard", "/api/auth/user", "/api/agency-members", "/api/health-check"]) {
    const res = await fetch(SITE + path, { redirect: "manual" }).catch(e => ({ error: e }));
    if (res.error) {
      console.log(path, "ERROR", res.error.message);
      continue;
    }
    const body = await readText(res);
    console.log(path, "=>", res.status, res.headers.get("content-type"), "|", short(body.text, 180));
  }

  console.log("\n=== 2. Extract Supabase env from deployed JS ===");
  const html = await fetch(SITE).then(r => r.text());
  const jsMatch = html.match(/\/assets\/[^"]+\.js/);
  console.log("main js:", jsMatch?.[0] || "NOT FOUND");
  if (!jsMatch) return;

  const js = await fetch(SITE + jsMatch[0]).then(r => r.text());
  const supabaseUrl = js.match(/https:\/\/[a-z0-9.-]+\.supabase\.co/)?.[0];
  const anonKey = js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];

  console.log("Supabase URL:", supabaseUrl || "NOT FOUND");
  console.log("Anon key found:", anonKey ? "YES" : "NO");
  if (!supabaseUrl || !anonKey) return;

  console.log("\n=== 3. Supabase login ===");
  const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const tokenBody = await readText(tokenRes);
  console.log("token status:", tokenRes.status);
  console.log(short(tokenBody.text, 900));

  const accessToken = tokenBody.json?.access_token;
  const authUserId = tokenBody.json?.user?.id;
  if (!accessToken) {
    console.log("\nDIAGNOSIS: Login Supabase gagal. Stop.");
    return;
  }

  console.log("\nAuth user id:", authUserId);

  console.log("\n=== 4. /api/auth/user with token ===");
  const authUserRes = await fetch(`${SITE}/api/auth/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const authUserBody = await readText(authUserRes);
  console.log("status:", authUserRes.status);
  console.log(authUserBody.text);

  const agencyId = authUserBody.json?.agencyId || authUserBody.json?.agency_id;
  console.log("agencyId from API:", agencyId || "NOT FOUND");

  if (!agencyId) {
    console.log("\nDIAGNOSIS: /api/auth/user tidak balikin agencyId. Dashboard owner pasti gagal load data agency.");
    return;
  }

  console.log("\n=== 5. /api/agency-members with token ===");
  for (const path of ["/api/agency-members", `/api/agency-members?agencyId=${agencyId}`]) {
    const res = await fetch(SITE + path, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await readText(res);
    console.log(path, "=>", res.status, res.headers.get("content-type"));
    console.log(short(body.text, 2000));
  }

  console.log("\n=== 6. Direct Supabase table visibility with same user token ===");
  console.log("If table returns 200 + data here, database/RLS allows it.");
  console.log("If API/dashboard is empty but REST has data, bug is frontend/API mapping.");
  console.log("If REST is empty but you know data exists, likely RLS/agency_id/user_id mismatch.");

  const tables = [
    "agency_members",
    "agencies",
    "clients",
    "packages",
    "trips",
    "orders",
    "payments",
    "agent_points",
    "agent_wallet_transactions",
    "missions",
    "staff_tasks",
    "notes",
    "ticket_prices",
    "profiles",
  ];

  for (const table of tables) {
    await countTable(supabaseUrl, anonKey, accessToken, table, agencyId);
  }

  console.log("\n=== 7. Summary hints ===");
  console.log("A. /api/auth/user must be 200 and include agencyId.");
  console.log("B. /api/agency-members must be 200 and include owner/agent/staff.");
  console.log("C. Dashboard tables by_agency_id should show old data if it still exists and RLS allows it.");
  console.log("D. 404 table = table name wrong/not in schema.");
  console.log("E. 401/403 = RLS/auth policy issue.");
  console.log("F. 200 [] with visible_any data = agency_id mismatch/filter bug.");
  console.log("G. 200 [] for everything = either data gone, wrong Supabase project, or RLS hiding it.");
}

main().catch(err => {
  console.error("SCRIPT ERROR:", err);
});
