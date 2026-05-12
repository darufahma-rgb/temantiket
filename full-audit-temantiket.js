const SITE = process.env.SITE || "https://temantiket.vercel.app";
const EMAIL = process.env.EMAIL || "";
const PASSWORD = process.env.PASSWORD || "";

const SPA_ROUTES = [
  "/",
  "/login",
  "/dashboard",
  "/bootstrap",
  "/orders",
  "/clients",
  "/packages",
  "/ticket-prices",
  "/staff",
  "/agent-center",
  "/calculator",
  "/notes",
  "/settings",
  "/public",
  "/tiket",
  "/cek-pemesanan",
];

const API_ROUTES_NO_TOKEN = [
  "/api/auth/user",
  "/api/agency-members",
  "/api/health-check",
  "/api/export/igh",
  "/api/export/invoice",
  "/api/ai/chat",
  "/api/ai/assistant",
];

const TABLE_CHECKS = [
  {
    table: "agency_members",
    queries: [
      { label: "any", query: "select=*&limit=20" },
      { label: "by_agency", query: (agencyId) => `select=*&agency_id=eq.${agencyId}&limit=50` },
    ],
  },
  {
    table: "profiles",
    queries: [
      { label: "any", query: "select=*&limit=50" },
      { label: "by_auth_user", query: (_, authUserId) => `select=*&id=eq.${authUserId}` },
    ],
  },
  {
    table: "agencies",
    queries: [
      { label: "any", query: "select=*&limit=10" },
      { label: "by_id", query: (agencyId) => `select=*&id=eq.${agencyId}` },
    ],
  },
  {
    table: "clients",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=id,name,agency_id,created_at,created_by_agent&agency_id=eq.${agencyId}&limit=20` },
    ],
  },
  {
    table: "orders",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=id,title,agency_id,status,total_price,created_at,created_by_agent&agency_id=eq.${agencyId}&limit=20` },
    ],
  },
  {
    table: "agent_points",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=*&agency_id=eq.${agencyId}&limit=20` },
    ],
  },
  {
    table: "agent_wallet_transactions",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=*&agency_id=eq.${agencyId}&limit=20` },
    ],
  },
  {
    table: "ticket_prices",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=id,agency_id,airline,from_code,to_code,base_price,is_published,created_at&agency_id=eq.${agencyId}&limit=20` },
    ],
  },
  {
    table: "notes",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=id,agency_id,title,created_at&agency_id=eq.${agencyId}&limit=20` },
    ],
  },
  {
    table: "packages",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=*&agency_id=eq.${agencyId}&limit=10` },
    ],
  },
  {
    table: "trips",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=*&agency_id=eq.${agencyId}&limit=10` },
    ],
  },
  {
    table: "payments",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=*&agency_id=eq.${agencyId}&limit=10` },
    ],
  },
  {
    table: "daily_missions",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=*&agency_id=eq.${agencyId}&limit=10` },
    ],
  },
  {
    table: "mission_templates",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=*&agency_id=eq.${agencyId}&limit=10` },
    ],
  },
  {
    table: "staff_tasks",
    queries: [
      { label: "by_agency", query: (agencyId) => `select=*&agency_id=eq.${agencyId}&limit=10` },
    ],
  },
];

function section(title) {
  console.log("\n" + "=".repeat(100));
  console.log(title);
  console.log("=".repeat(100));
}

function sub(title) {
  console.log("\n" + "-".repeat(80));
  console.log(title);
  console.log("-".repeat(80));
}

function short(value, max = 1400) {
  return String(value ?? "").slice(0, max).replace(/\n/g, " ");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function read(res) {
  const text = await res.text();
  return { text, json: safeJsonParse(text) };
}

async function fetchSafe(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const body = await read(res);
    return {
      ok: true,
      status: res.status,
      statusText: res.statusText,
      contentType: res.headers.get("content-type") || "",
      location: res.headers.get("location") || "",
      cacheControl: res.headers.get("cache-control") || "",
      body,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      statusText: "FETCH_ERROR",
      contentType: "",
      location: "",
      cacheControl: "",
      body: { text: String(e?.message || e), json: null },
    };
  }
}

function add(report, level, area, message, evidence = "") {
  report.problems.push({ level, area, message, evidence });
}

function summarizeArray(json) {
  if (!Array.isArray(json)) return { isArray: false, count: null };
  return { isArray: true, count: json.length };
}

async function restQuery(ctx, table, query) {
  const url = `${ctx.supabaseUrl}/rest/v1/${table}?${query}`;
  const res = await fetchSafe(url, {
    headers: {
      apikey: ctx.anonKey,
      Authorization: `Bearer ${ctx.accessToken}`,
      "Content-Type": "application/json",
    },
  });
  return res;
}

async function postApi(ctx, path, body, token = false) {
  const headers = { "Content-Type": "application/json" };
  if (token && ctx.accessToken) headers.Authorization = `Bearer ${ctx.accessToken}`;
  return fetchSafe(ctx.site + path, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
    redirect: "manual",
  });
}

async function main() {
  const report = {
    problems: [],
    routes: {},
    apiNoToken: {},
    apiWithToken: {},
    auth: {},
    data: {},
    assets: {},
    legacy: {},
  };

  const ctx = {
    site: SITE.replace(/\/+$/, ""),
    email: EMAIL,
    password: PASSWORD,
    supabaseUrl: null,
    anonKey: null,
    accessToken: null,
    authUserId: null,
    agencyId: null,
  };

  section("TEMANTIKET FULL PRODUCTION AUDIT");
  console.log("SITE:", ctx.site);
  console.log("EMAIL:", ctx.email || "(not provided)");
  console.log("TIME:", new Date().toISOString());

  if (!ctx.email || !ctx.password) {
    add(report, "WARN", "Credentials", "EMAIL/PASSWORD belum diisi. Audit auth dan data akan terbatas.");
  }

  section("1. SPA ROUTE AUDIT");
  for (const path of SPA_ROUTES) {
    const res = await fetchSafe(ctx.site + path, { redirect: "manual" });
    report.routes[path] = { status: res.status, type: res.contentType, location: res.location };
    console.log(`${path} => ${res.status} | ${res.contentType} | location=${res.location || "-"}`);
    console.log(short(res.body.text, 220));

    if (res.status !== 200) {
      add(report, "ERROR", "SPA Routing", `${path} status ${res.status}. React/Vite route harusnya return 200 text/html.`, short(res.body.text, 160));
    } else if (!res.contentType.includes("text/html")) {
      add(report, "WARN", "SPA Routing", `${path} 200 tapi content-type bukan text/html: ${res.contentType}`);
    }
  }

  section("2. API ROUTE AUDIT TANPA TOKEN");
  for (const path of API_ROUTES_NO_TOKEN) {
    const method = path.includes("/api/ai/") ? "POST" : "GET";
    const options = method === "POST"
      ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "ping" }), redirect: "manual" }
      : { method, redirect: "manual" };

    const res = await fetchSafe(ctx.site + path, options);
    report.apiNoToken[path] = { status: res.status, type: res.contentType };
    console.log(`${method} ${path} => ${res.status} | ${res.contentType}`);
    console.log(short(res.body.text, 360));

    if (path === "/api/health-check") {
      if (res.status !== 200) add(report, "ERROR", "API Health", "/api/health-check harusnya 200 JSON.", short(res.body.text, 160));
    } else if (path === "/api/auth/user" || path === "/api/agency-members") {
      if (res.status !== 401) add(report, "WARN", "Protected API", `${path} tanpa token idealnya 401 JSON, sekarang ${res.status}.`, short(res.body.text, 160));
    } else {
      if (res.status === 404) add(report, "ERROR", "API Routing", `${path} 404. Vercel API route belum benar/deploy belum update.`, short(res.body.text, 160));
    }
  }

  section("3. HTML + ASSET + BUNDLE AUDIT");
  const rootRes = await fetchSafe(ctx.site + "/", { redirect: "manual" });
  const html = rootRes.body.text || "";

  const assetRefs = [...new Set(
    Array.from(html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|webmanifest|png|ico|svg|webp))"/g)).map(m => m[1])
  )];

  console.log("Asset refs found:", assetRefs.length);
  const jsRefs = assetRefs.filter(a => a.endsWith(".js"));
  const cssRefs = assetRefs.filter(a => a.endsWith(".css"));

  let combinedJs = "";
  for (const asset of assetRefs.slice(0, 80)) {
    const url = asset.startsWith("http") ? asset : ctx.site + asset;
    const res = await fetchSafe(url, { redirect: "manual" });
    report.assets[asset] = { status: res.status, type: res.contentType };
    console.log(`${asset} => ${res.status} | ${res.contentType}`);

    if (res.status >= 400) {
      add(report, "ERROR", "Assets", `${asset} status ${res.status}.`, short(res.body.text, 100));
    }

    if (asset.endsWith(".js") && res.status === 200) {
      combinedJs += "\n/* " + asset + " */\n" + res.body.text;
    }
  }

  for (const path of ["/sw.js", "/registerSW.js", "/manifest.webmanifest", "/favicon.ico"]) {
    const res = await fetchSafe(ctx.site + path, { redirect: "manual" });
    console.log(`${path} => ${res.status} | ${res.contentType}`);
    report.assets[path] = { status: res.status, type: res.contentType };
  }

  report.legacy.hasApiLogin = combinedJs.includes("/api/login");
  report.legacy.hasApiLogout = combinedJs.includes("/api/logout");
  report.legacy.hasReplitAuthText = /Replit Auth|replitAuth|\/api\/login/i.test(combinedJs);

  if (report.legacy.hasApiLogin) {
    add(report, "ERROR", "Legacy Auth", "Bundle JS masih mengandung /api/login. Frontend production masih bisa ke Replit Auth lama.");
  }
  if (report.legacy.hasApiLogout) {
    add(report, "WARN", "Legacy Auth", "Bundle JS masih mengandung /api/logout. Pastikan logout Supabase tidak manggil route lama.");
  }

  ctx.supabaseUrl = combinedJs.match(/https:\/\/[a-z0-9.-]+\.supabase\.co/)?.[0] || null;
  ctx.anonKey = combinedJs.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0] || null;

  console.log("JS refs:", jsRefs.length);
  console.log("CSS refs:", cssRefs.length);
  console.log("Supabase URL found:", ctx.supabaseUrl || "NOT FOUND");
  console.log("Anon key found:", ctx.anonKey ? "YES" : "NO");
  console.log("Bundle contains /api/login:", report.legacy.hasApiLogin);
  console.log("Bundle contains /api/logout:", report.legacy.hasApiLogout);

  if (!ctx.supabaseUrl || !ctx.anonKey) {
    add(report, "ERROR", "Supabase Env", "Supabase URL/anon key tidak kebaca di deployed JS. Cek VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.");
  }

  if (ctx.email && ctx.password && ctx.supabaseUrl && ctx.anonKey) {
    section("4. SUPABASE AUTH AUDIT");
    const tokenRes = await fetchSafe(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: ctx.anonKey,
        Authorization: `Bearer ${ctx.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: ctx.email, password: ctx.password }),
    });

    report.auth.tokenStatus = tokenRes.status;
    console.log("Supabase /token =>", tokenRes.status);
    console.log(short(tokenRes.body.text, 1200));

    if (tokenRes.status !== 200 || !tokenRes.body.json?.access_token) {
      add(report, "ERROR", "Supabase Auth", `Supabase login gagal status ${tokenRes.status}.`, short(tokenRes.body.text, 260));
    } else {
      ctx.accessToken = tokenRes.body.json.access_token;
      ctx.authUserId = tokenRes.body.json.user?.id || null;
      console.log("Auth user id:", ctx.authUserId);
    }
  }

  if (ctx.accessToken) {
    section("5. AUTH PROFILE API AUDIT");
    const res = await fetchSafe(ctx.site + "/api/auth/user", {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    });

    report.apiWithToken["/api/auth/user"] = { status: res.status, body: res.body.json || res.body.text };
    console.log("/api/auth/user with token =>", res.status);
    console.log(res.body.text);

    if (res.status !== 200) {
      add(report, "ERROR", "Auth API", `/api/auth/user dengan token gagal status ${res.status}.`, short(res.body.text, 300));
    } else {
      ctx.agencyId = res.body.json?.agencyId || res.body.json?.agency_id || null;
      console.log("agencyId:", ctx.agencyId || "NOT FOUND");
      console.log("role:", res.body.json?.role || "NOT FOUND");

      if (!ctx.agencyId) {
        add(report, "ERROR", "Auth API", "/api/auth/user tidak mengembalikan agencyId.");
      }
    }

    section("6. AGENCY MEMBERS API AUDIT");
    for (const path of ["/api/agency-members", ctx.agencyId ? `/api/agency-members?agencyId=${ctx.agencyId}` : null].filter(Boolean)) {
      const r = await fetchSafe(ctx.site + path, {
        headers: { Authorization: `Bearer ${ctx.accessToken}` },
      });

      report.apiWithToken[path] = { status: r.status, body: r.body.json || r.body.text };
      console.log(`${path} with token => ${r.status}`);
      console.log(short(r.body.text, 3000));

      if (r.status !== 200 || !Array.isArray(r.body.json)) {
        add(report, "ERROR", "Agency Members API", `${path} harusnya 200 JSON array, sekarang ${r.status}.`, short(r.body.text, 400));
      } else {
        const counts = r.body.json.reduce((acc, m) => {
          const role = m.role || "unknown";
          acc[role] = (acc[role] || 0) + 1;
          return acc;
        }, {});
        console.log("role counts:", counts);

        if (!counts.owner) add(report, "ERROR", "Agency Members API", "Response tidak mengandung owner.");
        if (!counts.agent) add(report, "ERROR", "Agency Members API", "Response tidak mengandung agent.");
        if (!counts.staff) add(report, "WARN", "Agency Members API", "Response tidak mengandung staff.");
      }
    }
  }

  if (ctx.accessToken && ctx.supabaseUrl && ctx.anonKey && ctx.agencyId) {
    section("7. SUPABASE DATA VISIBILITY AUDIT");
    for (const check of TABLE_CHECKS) {
      sub(`TABLE ${check.table}`);
      report.data[check.table] = {};
      for (const q of check.queries) {
        const query = typeof q.query === "function" ? q.query(ctx.agencyId, ctx.authUserId) : q.query;
        const res = await restQuery(ctx, check.table, query);
        const summary = summarizeArray(res.body.json);

        report.data[check.table][q.label] = {
          status: res.status,
          count: summary.count,
          isArray: summary.isArray,
          body: res.body.json || res.body.text,
        };

        console.log(`${check.table}.${q.label} => ${res.status} count=${summary.count}`);
        console.log(short(res.body.text, 1200));

        if (res.status === 404) {
          add(report, "WARN", "Supabase Table", `${check.table} tidak ditemukan / tidak ada di schema cache.`, short(res.body.text, 180));
        } else if (res.status === 400 && /does not exist|column/i.test(res.body.text)) {
          add(report, "WARN", "Supabase Schema", `${check.table}.${q.label} schema/column mismatch.`, short(res.body.text, 220));
        } else if (res.status === 401 || res.status === 403) {
          add(report, "ERROR", "Supabase RLS", `${check.table}.${q.label} status ${res.status}. RLS/auth blocking.`, short(res.body.text, 220));
        } else if (res.status >= 500) {
          add(report, "ERROR", "Supabase REST", `${check.table}.${q.label} status ${res.status}.`, short(res.body.text, 220));
        }
      }
    }
  }

  if (ctx.accessToken && ctx.agencyId) {
    section("8. OWNER DASHBOARD DATA EXPECTATION AUDIT");
    const data = report.data;

    const expectations = [
      ["agency_members", "by_agency", "Agent/staff list"],
      ["profiles", "any", "Member names/emails"],
      ["clients", "by_agency", "Owner dashboard clients/jamaah"],
      ["orders", "by_agency", "Owner dashboard orders/revenue"],
      ["agent_points", "by_agency", "Agent points"],
      ["agent_wallet_transactions", "by_agency", "Agent wallet/commission"],
      ["ticket_prices", "by_agency", "Ticket prices"],
      ["notes", "by_agency", "Notes"],
    ];

    for (const [table, label, purpose] of expectations) {
      const item = data?.[table]?.[label];
      const status = item?.status;
      const count = item?.count;
      console.log(`${purpose}: ${table}.${label} status=${status} count=${count}`);

      if (status === 200 && count === 0) {
        add(report, "WARN", "Dashboard Data", `${purpose} kosong dari query ${table}.${label}. Kalau seharusnya ada, cek agency_id/filter/RLS.`);
      }
      if (status && status >= 400) {
        add(report, "ERROR", "Dashboard Data", `${purpose} gagal dibaca dari ${table}.${label} status ${status}.`);
      }
    }
  }

  section("9. API ENDPOINT BEHAVIOR AUDIT");
  const endpointTests = [
    { method: "GET", path: "/api/health-check", token: false, expect: [200] },
    { method: "GET", path: "/api/auth/user", token: true, expect: [200] },
    { method: "GET", path: "/api/agency-members", token: true, expect: [200] },
    { method: "POST", path: "/api/invite-member", token: false, expect: [401, 400, 405], body: {} },
    { method: "POST", path: "/api/remove-member", token: false, expect: [401, 400, 405], body: {} },
    { method: "POST", path: "/api/ai/chat", token: false, expect: [200, 400, 401, 500], body: { message: "ping" } },
    { method: "POST", path: "/api/ai/assistant", token: false, expect: [200, 400, 401, 500], body: { message: "ping" } },
  ];

  for (const t of endpointTests) {
    const headers = { "Content-Type": "application/json" };
    if (t.token && ctx.accessToken) headers.Authorization = `Bearer ${ctx.accessToken}`;

    const res = await fetchSafe(ctx.site + t.path, {
      method: t.method,
      headers,
      body: t.method === "POST" ? JSON.stringify(t.body || {}) : undefined,
      redirect: "manual",
    });

    console.log(`${t.method} ${t.path} token=${t.token} => ${res.status}`);
    console.log(short(res.body.text, 360));

    if (res.status === 404) {
      add(report, "ERROR", "API Routing", `${t.path} return 404. Function route belum benar/deploy belum update.`, short(res.body.text, 160));
    } else if (!t.expect.includes(res.status)) {
      add(report, "WARN", "API Endpoint", `${t.path} status ${res.status}, expected one of ${t.expect.join(", ")}.`, short(res.body.text, 180));
    }
  }

  section("10. SECURITY / CACHE / PRODUCTION HYGIENE AUDIT");
  if (ctx.password && combinedJs.includes(ctx.password)) {
    add(report, "ERROR", "Security", "Password muncul di JS bundle. Ini fatal.");
  }

  const suspiciousSecrets = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role",
    "OPENAI_API_KEY",
    "sk-",
  ];
  for (const s of suspiciousSecrets) {
    if (combinedJs.includes(s)) {
      add(report, "WARN", "Security", `Bundle JS mengandung string mencurigakan: ${s}. Pastikan bukan secret asli.`);
    }
  }

  const cacheHints = [
    { path: "/", expected: "html" },
    { path: jsRefs[0] || "", expected: "js" },
    { path: "/sw.js", expected: "sw" },
  ];

  for (const c of cacheHints) {
    if (!c.path) continue;
    const url = c.path.startsWith("/") ? ctx.site + c.path : ctx.site + "/" + c.path;
    const res = await fetchSafe(url, { redirect: "manual" });
    console.log(`${c.path} cache-control => ${res.cacheControl || "-"}`);
  }

  section("11. FINAL AUDIT REPORT");

  const errors = report.problems.filter(p => p.level === "ERROR");
  const warnings = report.problems.filter(p => p.level === "WARN");

  console.log("ERROR COUNT:", errors.length);
  console.log("WARNING COUNT:", warnings.length);

  const grouped = {};
  for (const p of report.problems) {
    grouped[p.area] ||= [];
    grouped[p.area].push(p);
  }

  for (const [area, items] of Object.entries(grouped)) {
    console.log(`\n[${area}]`);
    for (const p of items) {
      console.log(`- ${p.level}: ${p.message}`);
      if (p.evidence) console.log(`  Evidence: ${short(p.evidence, 280)}`);
    }
  }

  console.log("\nKEY STATUS SUMMARY:");
  console.log(JSON.stringify({
    spaRoutes: report.routes,
    apiNoToken: report.apiNoToken,
    auth: report.auth,
    apiWithToken: {
      authUser: report.apiWithToken["/api/auth/user"]?.status,
      agencyMembers: report.apiWithToken["/api/agency-members"]?.status,
    },
    dataCounts: Object.fromEntries(
      Object.entries(report.data).map(([table, entries]) => [
        table,
        Object.fromEntries(Object.entries(entries).map(([label, value]) => [label, { status: value.status, count: value.count }]))
      ])
    ),
    legacy: report.legacy,
  }, null, 2));

  console.log("\nTARGET IDEAL:");
  console.log("1. SPA routes (/login, /dashboard, /bootstrap, etc.) => 200 text/html");
  console.log("2. /api/auth/user tanpa token => 401 JSON");
  console.log("3. /api/agency-members tanpa token => 401 JSON");
  console.log("4. /api/health-check => 200 JSON");
  console.log("5. Supabase login => 200");
  console.log("6. /api/auth/user dengan token => 200 + agencyId");
  console.log("7. /api/agency-members dengan token => 200 array owner/agent/staff");
  console.log("8. Data lama clients/orders/profiles/agency_members terlihat dari Supabase REST");
  console.log("9. Bundle JS tidak mengandung /api/login");

  if (errors.length === 0) {
    console.log("\n✅ AUDIT RESULT: PASS untuk blocker utama.");
  } else {
    console.log("\n❌ AUDIT RESULT: MASIH ADA BLOCKER. Fix area ERROR di atas dulu.");
  }
}

main().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
