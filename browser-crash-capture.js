const { chromium } = require("playwright");

const SITE = process.env.SITE || "https://temantiket.vercel.app";
const EMAIL = process.env.EMAIL || "";
const PASSWORD = process.env.PASSWORD || "";
const AGENT_ID = process.env.AGENT_ID || "9ac5071b-e10c-43cd-bb67-0ff2fe40d65f";

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.log('Usage: SITE="https://temantiket.vercel.app" EMAIL="..." PASSWORD="..." AGENT_ID="..." node browser-crash-capture.js');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  const logs = [];
  const errors = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === "error") errors.push(text);
  });

  page.on("pageerror", (err) => {
    errors.push(`PAGEERROR: ${err.message}\n${err.stack || ""}`);
  });

  page.on("requestfailed", (req) => {
    failedRequests.push(`${req.method()} ${req.url()} => ${req.failure()?.errorText}`);
  });

  console.log("Opening login...");
  await page.goto(`${SITE}/login`, { waitUntil: "networkidle", timeout: 60000 });

  console.log("Trying login form...");
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="Email" i]',
  ];
  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[placeholder*="password" i]',
    'input[placeholder*="Password" i]',
    'input[placeholder*="sandi" i]',
  ];

  let emailInput = null;
  for (const s of emailSelectors) {
    const loc = page.locator(s).first();
    if (await loc.count()) {
      emailInput = loc;
      break;
    }
  }

  let passInput = null;
  for (const s of passwordSelectors) {
    const loc = page.locator(s).first();
    if (await loc.count()) {
      passInput = loc;
      break;
    }
  }

  if (!emailInput || !passInput) {
    console.log("Could not find email/password form. Current URL:", page.url());
    console.log("Page title:", await page.title());
    console.log("Body preview:", (await page.locator("body").innerText()).slice(0, 1200));
  } else {
    await emailInput.fill(EMAIL);
    await passInput.fill(PASSWORD);

    const submit = page.locator('button[type="submit"], button:has-text("Masuk"), button:has-text("Login"), button:has-text("Sign in")').first();
    if (await submit.count()) {
      await submit.click();
    } else {
      await passInput.press("Enter");
    }

    await page.waitForTimeout(5000);
  }

  console.log("After login URL:", page.url());

  const paths = [
    `/agents/${AGENT_ID}`,
    `/agent/${AGENT_ID}`,
    `/agent-profile/${AGENT_ID}`,
    `/agent-center/${AGENT_ID}`,
    `/staff/${AGENT_ID}`,
  ];

  for (const path of paths) {
    console.log("\nTesting", path);
    await page.goto(`${SITE}${path}`, { waitUntil: "networkidle", timeout: 60000 }).catch(e => {
      errors.push(`GOTO ERROR ${path}: ${e.message}`);
    });

    await page.waitForTimeout(2500);

    const bodyText = await page.locator("body").innerText().catch(() => "");
    console.log("URL:", page.url());
    console.log("Body preview:", bodyText.slice(0, 700).replace(/\n/g, " | "));

    if (bodyText.includes('Halaman "Profil Agen" error') || bodyText.includes("Terjadi kesalahan tak terduga")) {
      console.log("FOUND ROUTE ERROR BOUNDARY ON:", path);
    }
  }

  console.log("\n==============================");
  console.log("CONSOLE ERRORS / PAGE ERRORS");
  console.log("==============================");
  if (!errors.length) console.log("No browser errors captured.");
  else errors.forEach((e, i) => console.log(`\n#${i + 1}\n${e}`));

  console.log("\n==============================");
  console.log("FAILED REQUESTS");
  console.log("==============================");
  if (!failedRequests.length) console.log("No failed requests captured.");
  else failedRequests.forEach((e) => console.log(e));

  console.log("\n==============================");
  console.log("RECENT CONSOLE LOGS");
  console.log("==============================");
  logs.slice(-80).forEach((l) => console.log(l));

  await browser.close();
}

main().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
