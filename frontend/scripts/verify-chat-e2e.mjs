/**
 * End-to-end verification of the chat page:
 *   1. Sign up a fresh user.
 *   2. From the dashboard, click Study on Maths.
 *   3. Land on /chat?session=... with the empty conversation UI.
 *   4. Click a suggested question; verify both bubbles render.
 *   5. Type a follow-up question via the textarea; verify reply.
 *   6. Go back to dashboard; verify the chat now shows up under
 *      "Pick up where you left off".
 *   7. Capture screenshots at every interesting state.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("design-captures-variants", { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console error]", m.text());
});

const email = `chatv1+${Date.now()}@autistudy.local`;
console.log(`[1] Signing up ${email} (grade 6)...`);
await page.goto("http://localhost:3000/signup", { waitUntil: "networkidle" });
await page.locator('input[placeholder="Your name"]').fill("Hina");
await page.locator('input[placeholder="Email address"]').fill(email);
await page.locator('input[placeholder="Password"]').fill("test1234");
await page.locator('button[type="button"]:has-text("6")').click();
await Promise.all([
  page.waitForURL("**/dashboard", { timeout: 30000 }),
  page.locator('button[type="submit"]').click(),
]);
console.log("    on dashboard.");
await sleep(1500);

console.log("[2] Click Study on Maths card...");
await page.locator('h3:has-text("Maths")').first().locator("..").locator('button:has-text("Study")').click();

await page.waitForURL(/\/chat\?session=/, { timeout: 30000 });
console.log("    on chat:", page.url());
await sleep(1500);
await page.screenshot({ path: "design-captures-variants/chat-empty.png", fullPage: false });
console.log("    saved chat-empty.png");

console.log("[3] Click first suggested question...");
const firstSuggestion = page.locator("button:has-text('What is a fraction?')");
await firstSuggestion.click();

console.log("    waiting for assistant reply bubble...");
await page.waitForFunction(
  () => {
    const bubbles = document.querySelectorAll('[class*="rounded-3xl"][class*="rounded-bl-md"]');
    return bubbles.length >= 1;
  },
  { timeout: 30000 },
);
await sleep(800);
await page.screenshot({ path: "design-captures-variants/chat-with-reply.png", fullPage: false });
console.log("    saved chat-with-reply.png");

console.log("[4] Type follow-up question via textarea...");
const ta = page.locator('textarea[placeholder*="question"]');
await ta.fill("Can you give me an example with a pizza?");
await page.locator('button:has-text("Send")').click();

await page.waitForFunction(
  () => {
    const bubbles = document.querySelectorAll('[class*="rounded-3xl"]');
    return bubbles.length >= 4; // 2 user + 2 assistant minimum
  },
  { timeout: 30000 },
);
await sleep(1200);
await page.screenshot({ path: "design-captures-variants/chat-multi-turn.png", fullPage: false });
console.log("    saved chat-multi-turn.png");

console.log("[5] Go back to dashboard and check Pick up where you left off...");
await page.locator('header a:has-text("Dashboard"), nav a:has-text("Dashboard")').first().click();
await page.waitForURL("**/dashboard", { timeout: 30000 });
await sleep(2200);
await page.screenshot({ path: "design-captures-variants/dashboard-after-chat.png", fullPage: true });
console.log("    saved dashboard-after-chat.png");

console.log("[6] Click Resume on the same chat...");
await page.locator('button:has-text("Resume")').first().click();
await page.waitForURL(/\/chat\?session=/, { timeout: 30000 });
await sleep(1200);
await page.screenshot({ path: "design-captures-variants/chat-resumed.png", fullPage: false });
console.log("    saved chat-resumed.png");

await browser.close();
console.log("\nAll OK.");
