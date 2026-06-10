/**
 * Capture two screenshots of the polished dashboard:
 *   1. As a brand-new user (all 0s — empty states + count-up animation visible)
 *   2. As a user with manually-injected non-zero stats so we can see the
 *      celebration animation + populated states.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("design-captures-variants", { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log("[err]", err.message));

const email = `polish+${Date.now()}@autistudy.local`;

console.log("[1] Sign up new user (grade 6) ...");
await page.goto("http://localhost:3000/signup", { waitUntil: "networkidle" });
await page.locator('input[placeholder="Your name"]').fill("Sarah");
await page.locator('input[placeholder="Email address"]').fill(email);
await page.locator('input[placeholder="Password"]').fill("test1234");
await page.locator('button[type="button"]:has-text("6")').click();
await Promise.all([
  page.waitForURL("**/dashboard", { timeout: 30000 }),
  page.locator('button[type="submit"]').click(),
]);

console.log("[2] Wait for stat animations to complete (~1.5s) ...");
await page.waitForSelector('h1:has-text("Sarah")');
await sleep(1800);

console.log("[3] Screenshot polished empty-state dashboard ...");
await page.screenshot({
  path: "design-captures-variants/dashboard-v8-empty.png",
  fullPage: true,
});

await browser.close();
console.log("\nSaved: design-captures-variants/dashboard-v8-empty.png");
