const SITE = process.env.SITE || "https://temantiket.vercel.app";
const EMAIL = process.env.EMAIL || "";
const PASSWORD = process.env.PASSWORD || "";

async function read(res) {
  const text = await res.text();
  try { return { text, json: JSON.parse(text) }; }
  catch { return { text, json: null }; }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.log('Usage: SITE="https://temantiket.vercel.app" EMAIL="..." PASSWORD="..." node diagnose-agent-profile-crash.js');
    process.exit(1);
  }

  console.log("=== AGENT PROFILE CRASH DIAGNOSIS ===");
  console.log("SITE:", SITE);
  console.log("EMAIL:", EMAIL);

  const html = await fetch(SITE).then(r => r.text());
  const jsMatch = html.match(/\/assets\/[^"]+\.js/);
  console.log("main js:", jsMatch?.[0] || "NOT FOUND");

  if (!jsMatch) return;

  const js = await fetch(SITE + jsMatch[0]).then(r => r.text());
  const supabaseUrl = js.match(/https:\/\/[a-z0-9.-]+\.supabase\.co/)?.[0];
  const anonKey = js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];

  console.log("Supabase URL:", supabaseUrl || "NOT FOUND");
  console.log("Anon key:", anonKey ? "FOUND" : "NOT FOUND");

  if (!supabaseUrl || !anonKey) return;

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
  console.log("Supabase token status:", tokenRes.status);

  const accessToken = tokenBody.json?.access_token;
  if (!accessToken) {
    console.log("Login failed:", tokenBody.text.slice(0, 1000));
    return;
  }

  const authUserRes = await fetch(`${SITE}/api/auth/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const authUserBody = await read(authUserRes);
  console.log("/api/auth/user:", authUserRes.status, authUserBody.text.slice(0, 1000));

  const agencyId = authUserBody.json?.agencyId;
  if (!agencyId) {
    console.log("No agencyId. Stop.");
    return;
  }

  const membersRes = await fetch(`${SITE}/api/agency-members`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const membersBody = await read(membersRes);
  console.log("/api/agency-members:", membersRes.status);

  const members = Array.isArray(membersBody.json) ? membersBody.json : [];
  const agents = members.filter(m => m.role === "agent");
  console.log("agents:", agents.map(a => `${a.first_name || ""} ${a.last_name || ""} | ${a.email} | ${a.user_id}`).join("\n"));

  const targetAgent = agents[0];
  if (!targetAgent) {
    console.log("No agent found.");
    return;
  }

  console.log("\nTesting likely profile paths for first agent:", targetAgent.user_id);

  const paths = [
    `/agents/${targetAgent.user_id}`,
    `/agent/${targetAgent.user_id}`,
    `/agent-profile/${targetAgent.user_id}`,
    `/agent-center/${targetAgent.user_id}`,
    `/staff/${targetAgent.user_id}`,
  ];

  for (const path of paths) {
    const res = await fetch(SITE + path, { redirect: "manual" });
    const body = await read(res);
    console.log(path, "=>", res.status, res.headers.get("content-type"));
    console.log(body.text.slice(0, 160).replace(/\n/g, " "));
  }

  console.log("\n=== Static JS quick scan for common crash strings ===");
  const needles = [
    "uniqueOrderCountFromTxs",
    "deduplicateTxs",
    "computeFeeBreakdown",
    "field_agent_fee",
    "operational_fee",
    "Order dihapus",
    "AgentProfileOwnerView",
    "AgentProfile",
  ];

  for (const n of needles) {
    console.log(n, js.includes(n) ? "FOUND" : "not found");
  }

  console.log("\nNext: if page still crashes, open browser console and copy the red error stack.");
}

main().catch(e => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
