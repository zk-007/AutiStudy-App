/**
 * Sample the landing intro at multiple time points and capture screenshots,
 * to verify:
 *   - Tagline lingers ≥ 2s before fading.
 *   - Hero phase appears smoothly (no glitch/empty gap).
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.WEB_BASE_URL || "http://localhost:3000";
mkdirSync("design-captures-variants/timeline", { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: "networkidle" });
const t0 = Date.now();

// Sample at multiple points across the intro
const samples = [
  { label: "00-700ms", target: 700 },
  { label: "01-1500ms-tagline-just-in", target: 1500 },
  { label: "02-2500ms-tagline-mid", target: 2500 },
  { label: "03-3300ms-tagline-late", target: 3300 },
  { label: "04-3700ms-crossfading", target: 3700 },
  { label: "05-4200ms-hero-just-in", target: 4200 },
  { label: "06-5000ms-hero-final", target: 5000 },
];

for (const s of samples) {
  const elapsed = Date.now() - t0;
  if (elapsed < s.target) await page.waitForTimeout(s.target - elapsed);
  const file = `design-captures-variants/timeline/${s.label}.png`;
  await page.screenshot({ path: file });
  const heroText = await page.evaluate(() => {
    const hero = document.querySelector("#hero");
    return hero ? hero.innerText.replace(/\s+/g, " ").trim().slice(0, 120) : "no-hero";
  });
  console.log(`[${s.label}] ${heroText}`);
}

await browser.close();
console.log("\nScreenshots saved to design-captures-variants/timeline/");
