/**
 * Hit /chat with no query params — should land on the subject picker.
 */
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const email = `picker+${Date.now()}@autistudy.local`;
await page.goto("http://localhost:3000/signup", { waitUntil: "networkidle" });
await page.locator('input[placeholder="Your name"]').fill("Mira");
await page.locator('input[placeholder="Email address"]').fill(email);
await page.locator('input[placeholder="Password"]').fill("test1234");
await page.locator('button[type="button"]:has-text("5")').click();
await Promise.all([
  page.waitForURL("**/dashboard"),
  page.locator('button[type="submit"]').click(),
]);

await page.goto("http://localhost:3000/chat", { waitUntil: "networkidle" });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: "design-captures-variants/chat-picker.png", fullPage: false });

await browser.close();
console.log("Saved chat-picker.png");
