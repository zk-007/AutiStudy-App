import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.WEB_BASE_URL || "http://localhost:3000";
mkdirSync("design-captures-variants", { recursive: true });

const browser = await chromium.launch({ headless: true });

async function snapLogoPhase(label, locale) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  if (locale === "ur") await ctx.addInitScript(() => localStorage.setItem("autistudy_locale", "ur"));
  const page = await ctx.newPage();

  await page.goto(BASE, { waitUntil: "networkidle" });

  // Wait until the tagline appears in #hero (logo phase). The tagline is the
  // most reliable signal for "logo phase" since the wordmark is now EN-conditional.
  const taglineSnippet = locale === "ur" ? "ہر ذہن" : "adaptive learning";
  await page.waitForFunction((needle) => {
    const hero = document.querySelector("#hero");
    if (!hero) return false;
    return Array.from(hero.querySelectorAll("p")).some(
      (p) => (p.textContent || "").includes(needle) && p.offsetParent,
    );
  }, taglineSnippet, { timeout: 8000 });

  // Settle the fade-in
  await page.waitForTimeout(400);

  const info = await page.evaluate((locale) => {
    const hero = document.querySelector("#hero");
    const expectedBrand = locale === "ur" ? "آٹی اسٹڈی" : "AutiStudy";
    const big = Array.from(hero.querySelectorAll("*")).find((el) => {
      const t = (el.textContent || "").trim();
      return t === expectedBrand && parseFloat(getComputedStyle(el).fontSize) > 40;
    });
    const ps = Array.from(hero.querySelectorAll("p")).filter((p) => p.offsetParent);
    const taglineP = ps.sort(
      (a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize),
    )[0];
    return {
      hasWordmark: !!big,
      brandFontPx: big ? parseFloat(getComputedStyle(big).fontSize) : null,
      brandDir: big ? getComputedStyle(big).direction : null,
      brandText: big?.textContent.trim() ?? null,
      taglineText: taglineP?.textContent?.trim()?.slice(0, 100) ?? null,
      taglineFontPx: taglineP ? parseFloat(getComputedStyle(taglineP).fontSize) : null,
    };
  }, locale);

  const file = `design-captures-variants/${label}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(info, null, 2));
  console.log(`Saved: ${file}`);
  await ctx.close();
  return info;
}

const en = await snapLogoPhase("logo-phase-en", "en");
const ur = await snapLogoPhase("logo-phase-ur", "ur");

await browser.close();

let ok = true;
// EN: must NOT have the wordmark (we removed it), tagline should be big (≥30)
if (en.hasWordmark) { console.error(`FAIL: EN logo phase still shows the "AutiStudy" wordmark`); ok = false; }
if (!en.taglineFontPx || en.taglineFontPx < 30) { console.error(`FAIL: EN tagline font ${en.taglineFontPx}px (want ≥30)`); ok = false; }
// UR: MUST have the wordmark, tagline ≥ 24
if (!ur.hasWordmark) { console.error(`FAIL: UR logo phase missing the wordmark`); ok = false; }
if (!ur.taglineFontPx || ur.taglineFontPx < 24) { console.error(`FAIL: UR tagline font ${ur.taglineFontPx}px (want ≥24)`); ok = false; }
if (ur.brandDir !== "ltr") { console.error(`FAIL: UR brand dir is ${ur.brandDir}`); ok = false; }
console.log(ok ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
process.exit(ok ? 0 : 1);
