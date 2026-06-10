import { chromium } from "playwright";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000/?visual=svg-kid&fast=1", { waitUntil: "networkidle" });
await sleep(2500);

const orbs = await page.evaluate(() => {
  const result = [];
  document.querySelectorAll('[aria-label]').forEach((el) => {
    const r = el.getBoundingClientRect();
    result.push({
      label: el.getAttribute('aria-label'),
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      visible: r.width > 0 && r.height > 0,
    });
  });
  return result;
});

console.log("Aria-labelled elements:");
console.table(orbs);

// Also inspect anything inside #hero with absolute positioning
const allOrbs = await page.evaluate(() => {
  const hero = document.querySelector('#hero');
  if (!hero) return null;
  const all = [];
  hero.querySelectorAll('*').forEach((el) => {
    const text = el.textContent?.trim() || '';
    if (text === 'π' || text === '⚛' || text === '</>' || text === 'Aa' || text === '+' || text === '🧪') {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      all.push({
        text,
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        opacity: cs.opacity,
        display: cs.display,
      });
    }
  });
  return all;
});

console.log("\nGlyph elements found in #hero:");
console.table(allOrbs);

await browser.close();
