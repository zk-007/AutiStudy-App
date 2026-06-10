import { chromium } from "playwright";
import { mkdirSync } from "fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("design-captures-variants", { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

console.log("Loading landing page (fast=1) ...");
await page.goto("http://localhost:3000/?fast=1", { waitUntil: "networkidle" });
await sleep(2000);

// Scroll all the way down then back up so whileInView animations all fire
await page.evaluate(async () => {
  const total = document.body.scrollHeight;
  const step = window.innerHeight / 2;
  for (let y = 0; y <= total; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 250));
  }
  window.scrollTo(0, 0);
});
await sleep(1500);

await page.screenshot({ path: "design-captures-variants/landing-current-hero.png", fullPage: false });
await page.screenshot({ path: "design-captures-variants/landing-current-full.png", fullPage: true });
console.log("Saved.");
await browser.close();
