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
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // Verify NavBar appears immediately on /login (no 4s delay)
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await sleep(900); // give framer ~600ms to finish entrance
  await page.screenshot({ path: path.join(OUT, "11-login-fixed.png") });

  // Verify NavBar appears immediately on /faq
  await page.goto(`${BASE}/faq`, { waitUntil: "networkidle" });
  await sleep(900);
  try {
    await page.getByRole("button", { name: /which grades/i }).click({ timeout: 4000 });
  } catch {}
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, "12-faq-fixed.png") });

  // Verify Dashboard is fully translated in EN
  // First force English locale by clearing storage
  await page.goto(BASE);
  await page.evaluate(() => localStorage.removeItem("autistudy_locale"));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, "13-dashboard-en-fixed.png") });

  // Verify Dashboard fully translated in Urdu
  await page.evaluate(() => localStorage.setItem("autistudy_locale", "ur"));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, "14-dashboard-ur-fixed.png") });

  await browser.close();
  console.log("Verification PNGs ->", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
