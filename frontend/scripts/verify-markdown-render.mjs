/**
 * Quick verification: assistant chat bubbles now render Markdown
 * (so `**bold**` shows as bold text, not literal asterisks).
 *
 * We bypass auth by calling the API directly to get a token + chat session,
 * then inject an assistant message with markdown-y content into localStorage
 * via a stubbed /messages response. Simpler approach: just send a real
 * message and inspect the rendered DOM.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.WEB_BASE_URL || "http://localhost:3000";
const API = process.env.API_BASE_URL || "http://127.0.0.1:8000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("design-captures-variants", { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

// Stub the /messages POST so we get a deterministic markdown reply, fast.
const MOCK_REPLY = `Great question! Here's a quick breakdown about Earth:

1. **Shape**: Earth is round, like a *ball*. This shape is called a sphere.
2. **Surface**: About **71%** of Earth's surface is covered with water.
3. **Atmosphere**: Earth has a layer of \`air\` around it.

- It rotates on its axis
- It orbits the Sun

> Earth is the third planet from the Sun.`;

await page.route("**/api/chat/sessions/*/messages", async (route) => {
  const body = {
    user_message: { id: "u1", role: "user", content: "Tell me about Earth", created_at: new Date().toISOString() },
    assistant_message: { id: "a1", role: "assistant", content: MOCK_REPLY, created_at: new Date().toISOString() },
  };
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});

// Sign up a fresh user via API to skip the form
const email = `mdtest_${Date.now()}@autistudy.test`;
const signup = await fetch(`${API}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Pass1234!", name: "MD Test", grade: 4, role: "student" }),
});
if (!signup.ok) {
  console.error("Signup failed:", signup.status, await signup.text());
  process.exit(1);
}
const { token } = await signup.json();
console.log("[setup] token acquired");

// Inject token via localStorage before app boots
await page.addInitScript((t) => {
  localStorage.setItem("autistudy_token", t);
}, token);

await page.goto(`${BASE}/chat?subject=General%20Science`, { waitUntil: "networkidle" });
await sleep(1500);

// Wait for the composer + send the message
const textarea = page.locator("textarea");
await textarea.waitFor({ state: "visible", timeout: 15000 });
await textarea.click();
await textarea.fill("Tell me about Earth");
await textarea.press("Enter");

// Wait for the mocked assistant bubble
await page.waitForFunction(
  () => {
    const els = Array.from(document.querySelectorAll("*"));
    return els.some((el) => el.textContent && el.textContent.includes("Earth is the third planet"));
  },
  { timeout: 15000 },
);

await sleep(800);

// Check that **Shape** is rendered as a real <strong>, not literal asterisks
const checks = await page.evaluate(() => {
  const result = { strongCount: 0, hasLiteralAsterisks: false, hasOrderedList: false, hasUnorderedList: false, hasBlockquote: false, hasInlineCode: false, hasItalic: false };
  const bubbles = Array.from(document.querySelectorAll(".markdown-body"));
  if (bubbles.length === 0) return { ...result, error: "No .markdown-body found" };
  const last = bubbles[bubbles.length - 1];
  const text = last.textContent || "";
  result.strongCount = last.querySelectorAll("strong").length;
  result.hasLiteralAsterisks = text.includes("**");
  result.hasOrderedList = !!last.querySelector("ol");
  result.hasUnorderedList = !!last.querySelector("ul");
  result.hasBlockquote = !!last.querySelector("blockquote");
  result.hasInlineCode = !!last.querySelector("code");
  result.hasItalic = !!last.querySelector("em");
  return result;
});

console.log("\n=== Markdown render checks ===");
console.log(JSON.stringify(checks, null, 2));

const screenshotPath = "design-captures-variants/chat-markdown-render.png";
await page.screenshot({ path: screenshotPath, fullPage: false });
console.log(`\nScreenshot saved: ${screenshotPath}`);

let ok = true;
if (checks.strongCount < 3) { console.error("FAIL: expected ≥3 <strong> elements"); ok = false; }
if (checks.hasLiteralAsterisks) { console.error("FAIL: literal ** still visible"); ok = false; }
if (!checks.hasOrderedList) { console.error("FAIL: no <ol>"); ok = false; }
if (!checks.hasUnorderedList) { console.error("FAIL: no <ul>"); ok = false; }
if (!checks.hasBlockquote) { console.error("FAIL: no <blockquote>"); ok = false; }
if (!checks.hasInlineCode) { console.error("FAIL: no inline <code>"); ok = false; }
if (!checks.hasItalic) { console.error("FAIL: no <em>"); ok = false; }

await browser.close();
if (ok) {
  console.log("\nALL CHECKS PASSED — markdown renders correctly.");
  process.exit(0);
} else {
  console.error("\nSome checks failed.");
  process.exit(1);
}
