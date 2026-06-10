/**
 * End-to-end verification:
 *   1. Open /signup
 *   2. Fill name/email/password, pick grade 6
 *   3. Submit and confirm we land on /dashboard
 *   4. Confirm real data is visible (greeting, stats, subjects)
 *   5. Take a screenshot for visual review
 *   6. Log out and confirm we end up logged out
 */

import { chromium } from "playwright";
import { mkdirSync } from "fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = Date.now();
const email = `e2e+${ts}@autistudy.local`;
const name = "E2E Tester";
const password = "test1234";

mkdirSync("design-captures-variants", { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") console.log("  [browser error]", msg.text());
});
page.on("pageerror", (err) => console.log("  [page error]", err.message));

console.log("[1] Open /signup");
await page.goto("http://localhost:3000/signup", { waitUntil: "domcontentloaded" });
await sleep(800);

console.log("[2] Fill form (email:", email, ")");
await page.locator('input[placeholder="Your name"]').fill(name);
await page.locator('input[placeholder="Email address"]').fill(email);
await page.locator('input[placeholder="Password"]').fill(password);
await page.locator('button[type="button"]:has-text("6")').click();

console.log("[3] Submit");
await Promise.all([
  page.waitForURL("**/dashboard", { timeout: 30000 }),
  page.locator('button[type="submit"]:has-text("Create account")').click(),
]);
console.log("    landed on:", page.url());

console.log("[4] Wait for dashboard data");
// Wait for greeting + at least one subject card
await page.waitForSelector(`h1:has-text("${name}")`, { timeout: 8000 });
await page.waitForSelector('h3:has-text("Maths")', { timeout: 8000 });
await sleep(1200); // let stat numbers settle

const greeting = await page.locator(`h1:has-text("${name}")`).textContent();
const grade = await page.locator("text=Grade 6").first().textContent();
const subjects = await page.locator("h3").allTextContents();
console.log("    greeting:", greeting?.trim());
console.log("    grade text:", grade?.trim());
console.log("    subject headings:", subjects);

await page.screenshot({ path: "design-captures-variants/dashboard-real.png", fullPage: true });
console.log("    saved screenshot -> design-captures-variants/dashboard-real.png");

console.log("[5] Click Log out");
await page.locator('button[aria-label="Log out"]').click();
await sleep(1500);
console.log("    after logout url:", page.url());

await browser.close();
console.log("\nDone.");
