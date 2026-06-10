/**
 * Verify the chat now hits a real LLM (key loaded from .streamlit/secrets.toml)
 * AND that the new "not configured" banner styling is correct.
 *
 * Two passes:
 *   1) Real-LLM run — sign up, ask Maths question, expect a substantive reply
 *      (not the placeholder snippet). Capture chat-real-llm.png so we can see
 *      a real GPT answer rendered in the bubble.
 *   2) Banner-style check — intercept /api/chat/config to force the response
 *      to {tutor_configured:false} and capture chat-banner-styled.png to
 *      confirm the new contained-card layout looks right.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("design-captures-variants", { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

// ─── Pass 1: real LLM ─────────────────────────────────────────────────────
const email = `realllm+${Date.now()}@autistudy.local`;
console.log(`[1] Signup ${email} (grade 6)...`);
await page.goto("http://localhost:3000/signup", { waitUntil: "networkidle" });
await page.locator('input[placeholder="Your name"]').fill("Sara");
await page.locator('input[placeholder="Email address"]').fill(email);
await page.locator('input[placeholder="Password"]').fill("test1234");
await page.locator('button[type="button"]:has-text("6")').click();
await Promise.all([
  page.waitForURL("**/dashboard"),
  page.locator('button[type="submit"]').click(),
]);
await sleep(1200);

console.log("[2] Open Maths chat...");
await page.locator('h3:has-text("Maths")').first().locator("..").locator('button:has-text("Study")').click();
await page.waitForURL(/\/chat\?session=/, { timeout: 30000 });
await sleep(1500);

console.log("[3] Send a real question (will hit gpt-4o-mini)...");
await page.locator('textarea').fill("Explain fractions to me in two short sentences.");
const t0 = Date.now();
await page.locator('button:has-text("Send")').click();

// Wait for the assistant bubble (not the "thinking…" placeholder) to appear.
await page.waitForFunction(
  () => {
    const stillThinking = !!Array.from(document.querySelectorAll("span")).find(
      (el) => el.textContent && el.textContent.includes("Tutor is thinking"),
    );
    if (stillThinking) return false;
    return document.querySelectorAll('[class*="rounded-bl-md"]').length >= 1;
  },
  { timeout: 60000 },
);
const elapsed = Date.now() - t0;
console.log(`    reply received in ${elapsed}ms`);
await sleep(800);

const replyText = await page.locator('[class*="rounded-bl-md"]').last().innerText();
console.log("    REPLY PREVIEW:", replyText.slice(0, 220).replace(/\n/g, " "));
const isPlaceholder = replyText.includes("not fully set up yet");
console.log(isPlaceholder ? "    ⚠ STILL PLACEHOLDER" : "    ✓ REAL LLM RESPONSE");
await page.screenshot({ path: "design-captures-variants/chat-real-llm.png", fullPage: false });

// ─── Pass 2: banner styling (force not-configured) ─────────────────────────
console.log("\n[4] Forcing tutor_configured=false to capture banner styling...");
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page2 = await ctx2.newPage();

const email2 = `banner+${Date.now()}@autistudy.local`;
await page2.goto("http://localhost:3000/signup", { waitUntil: "networkidle" });
await page2.locator('input[placeholder="Your name"]').fill("Ali");
await page2.locator('input[placeholder="Email address"]').fill(email2);
await page2.locator('input[placeholder="Password"]').fill("test1234");
await page2.locator('button[type="button"]:has-text("4")').click();
await Promise.all([
  page2.waitForURL("**/dashboard"),
  page2.locator('button[type="submit"]').click(),
]);
await sleep(1000);

await page2.route("**/api/chat/config", (route) => {
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ tutor_configured: false }),
  });
});

await page2.locator('h3:has-text("General Science")').first().locator("..").locator('button:has-text("Study")').click();
await page2.waitForURL(/\/chat\?session=/, { timeout: 30000 });
await sleep(1500);
await page2.screenshot({ path: "design-captures-variants/chat-banner-styled.png", fullPage: false });
console.log("    saved chat-banner-styled.png");

await browser.close();
console.log("\nDone.");
