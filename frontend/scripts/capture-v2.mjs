import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const VIEWPORT = { width: 1440, height: 900 };
const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "design-captures-v2");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: "networkidle" });

  // Phase 1 — big AUTISTUDY (around 1s)
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, "01-phase-big.png") });

  // Phase 2 — AutiStudy wordmark + tagline (around 3.5s)
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, "02-phase-logo.png") });

  // Mid-transition (around 5.4s) — should be just before the morph
  await sleep(1900);
  await page.screenshot({ path: path.join(OUT, "03-mid-transition.png") });

  // Phase 3 — full hero with educational visual (around 7.5s)
  await sleep(2200);
  await page.screenshot({ path: path.join(OUT, "04-phase-hero.png") });

  // Hero settled (around 9s) — same viewport, no scroll
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, "05-hero-settled.png") });

  // Scroll down to features (now via natural user scroll)
  await page.locator("#features").scrollIntoViewIfNeeded();
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, "06-features.png") });

  // How it works
  await page.locator("#how").scrollIntoViewIfNeeded();
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, "07-how.png") });

  await browser.close();
  console.log("Captures ->", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
