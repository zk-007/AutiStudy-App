import { chromium } from "playwright";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// ---- Test 1: signup "Create account" button settles to rotate:0 ----
console.log("\n[1] Testing Create account button settle behavior...");
await page.goto("http://localhost:3000/signup", { waitUntil: "networkidle" });
await sleep(800);

const button = page.locator('button:has-text("Create account")');
await button.hover();
await sleep(200); // mid-rotation
await button.click();
await sleep(800); // wait for settle

// Move mouse far away so hover ends
await page.mouse.move(10, 10);
await sleep(800);

const state = await button.evaluate((el) => {
  const cs = getComputedStyle(el);
  // Parse the matrix() to extract rotation in degrees
  const m = cs.transform.match(/matrix\(([^)]+)\)/);
  if (!m) return { transform: cs.transform, rotation: 0 };
  const v = m[1].split(",").map(Number);
  // matrix(a,b,c,d,e,f) where rotation = atan2(b,a)
  const rotation = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  return { transform: cs.transform, rotation: Number(rotation.toFixed(3)) };
});
console.log("  Button transform:", state.transform);
console.log("  Final rotation (degrees):", state.rotation, state.rotation === 0 ? "PASS" : "(should be 0)");
await page.screenshot({ path: "design-captures-variants/signup-after-click.png" });

// ---- Test 2: "Watch how it works" scrolls to #how ----
console.log("\n[2] Testing Watch how it works scroll behavior...");
await page.goto("http://localhost:3000/?fast=1", { waitUntil: "networkidle" });
await sleep(2500);

const scrollBefore = await page.evaluate(() => window.scrollY);
console.log("  scrollY before:", scrollBefore);

await page.locator('button:has-text("Watch how it works")').click();
await sleep(4500); // wait for the smooth scroll to finish

const scrollAfter = await page.evaluate(() => window.scrollY);
const howSectionTop = await page
  .locator("#how")
  .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
console.log("  scrollY after:", scrollAfter);
console.log("  #how section top is at:", howSectionTop);
console.log(
  "  Scrolled to #how:",
  Math.abs(scrollAfter - howSectionTop) < 80 ? "PASS" : "(should be near " + howSectionTop + ")"
);
await page.screenshot({ path: "design-captures-variants/after-watch-how.png" });

await browser.close();
console.log("\nDone.");
