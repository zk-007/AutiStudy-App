import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const VIEWPORT = { width: 1440, height: 900 };
const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "design-captures");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const logs = { console: [], pageerror: [], requestfailed: [] };
  page.on("console", (msg) => logs.console.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => logs.pageerror.push(String(err)));
  page.on("requestfailed", (req) =>
    logs.requestfailed.push({ url: req.url(), failure: req.failure()?.errorText })
  );

  // Step 1-3: Home / intro / hero
  await page.goto(BASE, { waitUntil: "networkidle" });

  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, "01-intro-1s.png") });

  await sleep(2200);
  await page.screenshot({ path: path.join(OUT, "02-intro-3s.png") });

  await sleep(5500);
  await page.screenshot({ path: path.join(OUT, "03-hero.png") });

  // Step 4: Features
  await page.locator("#features").scrollIntoViewIfNeeded();
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, "04-features.png") });

  // Step 5: How it works
  await page.locator("#how").scrollIntoViewIfNeeded();
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, "05-how-it-works.png") });

  // Step 6: Hero hover
  await page.locator("#hero").scrollIntoViewIfNeeded();
  await sleep(600);
  const getStarted = page.getByRole("link", { name: /get started/i }).first();
  await getStarted.hover();
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, "06-hero-hover.png") });

  // Step 7: Login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, "07-login.png") });

  // Step 8: FAQ
  await page.goto(`${BASE}/faq`, { waitUntil: "networkidle" });
  await sleep(600);
  try {
    await page.getByRole("button", { name: /which grades/i }).click({ timeout: 4000 });
  } catch {}
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, "08-faq.png") });

  // Step 9: Urdu RTL hero
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(8500);
  try {
    await page.getByRole("button", { name: /toggle language/i }).click({ timeout: 4000 });
  } catch {}
  await sleep(800);
  await page.locator("#hero").scrollIntoViewIfNeeded();
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, "09-hero-urdu.png") });

  // Step 10: Dashboard
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, "10-dashboard.png") });

  fs.writeFileSync(
    path.join(OUT, "browser-log.json"),
    JSON.stringify(logs, null, 2),
    "utf8"
  );

  await browser.close();
  console.log("Done. PNGs + browser-log.json ->", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
