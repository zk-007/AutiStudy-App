import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.WEB_BASE_URL || "http://localhost:3000";
mkdirSync("design-captures-variants", { recursive: true });

const browser = await chromium.launch({ headless: true });

async function snap(label, locale, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  if (locale === "ur") {
    await ctx.addInitScript(() => localStorage.setItem("autistudy_locale", "ur"));
  }
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  if (opts.waitFor) await page.waitForSelector(opts.waitFor, { timeout: 10000 });
  if (opts.extraWait) await page.waitForTimeout(opts.extraWait);

  const info = await page.evaluate(() => {
    const hero = document.querySelector("#hero");
    if (!hero) return { error: "no #hero" };
    const ps = Array.from(hero.querySelectorAll("p")).filter((p) => p.offsetParent);
    const headline = hero.querySelector("h1");
    const heroText = hero.innerText.replace(/\s+/g, " ").trim().slice(0, 250);
    const occurrences = (hero.innerText.match(/AutiStudy/gi) || []).length;
    // Find brand text element
    const brandSpans = Array.from(hero.querySelectorAll("*")).filter((el) => {
      const t = (el.textContent || "").trim();
      return t === "AutiStudy" || t === "AUTISTUDY";
    });
    return {
      autiStudyOccurrences: occurrences,
      headlineText: headline?.innerText || null,
      headlineFontPx: headline ? parseFloat(getComputedStyle(headline).fontSize) : null,
      paragraphFontPxList: ps.map((p) => parseFloat(getComputedStyle(p).fontSize)),
      brandElements: brandSpans.map((el) => ({
        text: el.textContent.trim(),
        dir: getComputedStyle(el).direction,
        fontPx: parseFloat(getComputedStyle(el).fontSize),
      })),
      heroText,
    };
  });

  const file = `design-captures-variants/${label}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(info, null, 2));
  console.log(`Saved: ${file}`);
  await ctx.close();
  return info;
}

// 1. Hero with ?fast=1 — bypasses intro, lets us inspect hero directly
await snap("hero-fast-en", "en", `${BASE}/?fast=1`, { waitFor: "h1", extraWait: 1500 });
await snap("hero-fast-ur", "ur", `${BASE}/?fast=1`, { waitFor: "h1", extraWait: 1500 });

// 2. Full intro flow — wait long enough for it to settle (hero phase)
await snap("intro-final-en", "en", BASE, { waitFor: "h1", extraWait: 2000 });
await snap("intro-final-ur", "ur", BASE, { waitFor: "h1", extraWait: 2000 });

await browser.close();
