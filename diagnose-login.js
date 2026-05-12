const SITE = process.env.SITE;
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

async function main() {
  if (!SITE || !EMAIL || !PASSWORD) {
    console.log("Usage: SITE=https://... EMAIL=... PASSWORD=... node diagnose-login.js");
    process.exit(1);
  }

  console.log("SITE:", SITE);
  console.log("EMAIL:", EMAIL);

  for (const path of ["/", "/login", "/dashboard", "/bootstrap", "/api/health-check", "/api/auth/user"]) {
    const res = await fetch(SITE + path, { redirect: "manual" });
    const text = await res.text();
    console.log("\nROUTE", path);
    console.log("status:", res.status);
    console.log("type:", res.headers.get("content-type"));
    console.log("body:", text.slice(0, 220).replace(/\n/g, " "));
  }

  const html = await fetch(SITE).then(r => r.text());
  const jsMatch = html.match(/\/assets\/[^"]+\.js/);
  console.log("\nmain js:", jsMatch?.[0] || "NOT FOUND");

  const js = jsMatch ? await fetch(SITE + jsMatch[0]).then(r => r.text()) : "";
  const supabaseUrl = js.match(/https:\/\/[a-z0-9.-]+\.supabase\.co/)?.[0];
  const anonKey = js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];

  console.log("Supabase URL:", supabaseUrl || "NOT FOUND");
  console.log("Anon key:", anonKey ? "FOUND" : "NOT FOUND");

  if (!supabaseUrl || !anonKey) {
    console.log("\nDIAGNOSIS: Supabase env tidak kebaca di build Vercel.");
    return;
  }

  const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  const tokenJson = await tokenRes.json().catch(async () => ({ raw: await tokenRes.text() }));
  console.log("\nSupabase /token status:", tokenRes.status);
  console.log(JSON.stringify(tokenJson, null, 2).slice(0, 1000));

  if (!tokenJson.access_token) {
    console.log("\nDIAGNOSIS: Supabase login gagal. Masalah akun/password/Supabase Auth.");
    return;
  }

  const userRes = await fetch(`${SITE}/api/auth/user`, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });

  const userText = await userRes.text();
  console.log("\n/api/auth/user status:", userRes.status);
  console.log(userText.slice(0, 2000));

  console.log("\nDIAGNOSIS:");
  if (userRes.status === 200) console.log("Auth API sukses. Kalau UI masih stuck, masalah kemungkinan frontend redirect/state/cache.");
  else if (userRes.status === 401) console.log("Auth API 401: token tidak kebaca/invalid di backend.");
  else if (userRes.status === 404) console.log("Auth API 404: route belum ada di Vercel deploy atau routing API salah.");
  else if (userRes.status >= 500) console.log("Auth API 500: cek Vercel Function Logs/env/database.");
  else console.log("Status tidak umum, lihat response.");
}

main().catch(console.error);
