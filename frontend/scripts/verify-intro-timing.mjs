/**
 * Measures real-world phase durations by polling the DOM at 50ms intervals.
 * Reports:
 *   - When the tagline first becomes visible
 *   - When the tagline starts fading out (opacity drops below 0.95)
 *   - When the tagline is fully gone (opacity ≈ 0)
 *   - When the hero headline first becomes visible
 *   - Tagline visible duration
 *   - Crossfade overlap duration
 */
import { chromium } from "playwright";

const BASE = process.env.WEB_BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: "networkidle" });
const start = Date.now();

const events = [];
let prev = { tagline: null, headline: null };

while (Date.now() - start < 9000) {
  const now = Date.now() - start;
  const state = await page.evaluate(() => {
    const hero = document.querySelector("#hero");
    if (!hero) return { tagline: null, headline: null };
    const ps = Array.from(hero.querySelectorAll("p"));
    const tagP = ps.find((p) => (p.textContent || "").includes("adaptive learning"));
    const tagBlock = tagP?.closest('[class*="absolute"]');
    const tagOpacity = tagBlock ? parseFloat(getComputedStyle(tagBlock).opacity) : 0;
    const h1 = hero.querySelector("h1");
    const h1Block = h1?.closest('[class*="absolute"]');
    const h1Opacity = h1Block ? parseFloat(getComputedStyle(h1Block).opacity) : 0;
    return { tagline: tagOpacity, headline: h1Opacity };
  });

  if (state.tagline !== prev.tagline || state.headline !== prev.headline) {
    events.push({ ms: now, ...state });
    prev = state;
  }
  await page.waitForTimeout(50);
}

await browser.close();

console.log("Phase opacity timeline (ms since networkidle):");
console.log("ms\ttagline\theadline");
for (const e of events) {
  console.log(`${e.ms}\t${e.tagline?.toFixed(2) ?? "—"}\t${e.headline?.toFixed(2) ?? "—"}`);
}

// Compute durations
const tagFirstVisible = events.find((e) => e.tagline > 0.05)?.ms;
const tagFullyVisible = events.find((e) => e.tagline > 0.95)?.ms;
const tagStartFade = events.findLast((e) => e.tagline > 0.95)?.ms;
const tagFullyGone = events.find((e) => tagFirstVisible !== undefined && e.ms > tagFirstVisible && e.tagline < 0.05)?.ms;
const heroFirstVisible = events.find((e) => e.headline > 0.05)?.ms;
const heroFullyVisible = events.find((e) => e.headline > 0.95)?.ms;

console.log("\n=== Summary ===");
console.log(`Tagline first visible     : ${tagFirstVisible} ms`);
console.log(`Tagline fully visible     : ${tagFullyVisible} ms`);
console.log(`Tagline starts fading     : ${tagStartFade} ms`);
console.log(`Tagline fully gone        : ${tagFullyGone} ms`);
console.log(`Hero first visible        : ${heroFirstVisible} ms`);
console.log(`Hero fully visible        : ${heroFullyVisible} ms`);
if (tagFullyVisible && tagStartFade) {
  console.log(`\n→ Tagline READABLE TIME (full opacity): ${tagStartFade - tagFullyVisible} ms`);
}
if (tagFirstVisible && tagFullyGone) {
  console.log(`→ Tagline ON-SCREEN TIME (any opacity): ${tagFullyGone - tagFirstVisible} ms`);
}
if (tagStartFade && heroFirstVisible) {
  console.log(`→ Crossfade overlap (tag fading + hero appearing): ${tagStartFade < heroFirstVisible ? heroFirstVisible - tagStartFade : "concurrent"}`);
}
