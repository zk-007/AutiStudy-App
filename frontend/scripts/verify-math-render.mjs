/**
 * Verify that math in assistant chat bubbles now renders as real symbols
 * via KaTeX, not as raw LaTeX like `\frac{2}{4}`.
 *
 * Mirrors the exact reply from the user's screenshot, where GPT used
 * `( \frac{2}{4} )` (escaped parens) and `[ ... ]` (escaped brackets).
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

// Reply that mirrors the user's screenshot — uses both `\( ... \)` and `\[ ... \]`.
const MOCK_REPLY = `Great question! Let's solve \\( \\frac{2}{4} + \\frac{5}{6} \\) step by step.

1. **Simplify \\( \\frac{2}{4} \\)**:
   - \\( \\frac{2}{4} \\) can be simplified to \\( \\frac{1}{2} \\) because both 2 and 4 can be divided by 2.

2. **Find a common denominator**:
   - The denominators are 2 and 6. The smallest number that both 2 and 6 can divide into evenly is 6.

3. **Convert \\( \\frac{1}{2} \\) to have a denominator of 6**:
   - To do this, we can multiply the top and bottom of \\( \\frac{1}{2} \\) by 3: \\[ \\frac{1 \\times 3}{2 \\times 3} = \\frac{3}{6} \\]

4. **Now, add \\( \\frac{3}{6} + \\frac{5}{6} \\)**:
   - Since the denominators are the same, we can just add the numerators: \\[ 3 + 5 = 8 \\]
   - So, \\( \\frac{3}{6} + \\frac{5}{6} = \\frac{8}{6} \\).

5. **Simplify \\( \\frac{8}{6} \\)**:
   - Both 8 and 6 can be divided by 2: \\[ \\frac{8 \\div 2}{6 \\div 2} = \\frac{4}{3} \\]

So, \\( \\frac{2}{4} + \\frac{5}{6} = \\frac{4}{3} \\).

Can you tell me what \\( \\frac{4}{3} \\) means in terms of whole numbers and fractions?`;

await page.route("**/api/chat/sessions/*/messages", async (route) => {
  const body = {
    user_message: { id: "u1", role: "user", content: "what is 2/4 + 5/6?", created_at: new Date().toISOString() },
    assistant_message: { id: "a1", role: "assistant", content: MOCK_REPLY, created_at: new Date().toISOString() },
  };
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});

const email = `mathtest_${Date.now()}@autistudy.test`;
const signup = await fetch(`${API}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Pass1234!", name: "Math Test", grade: 4, role: "student" }),
});
if (!signup.ok) {
  console.error("Signup failed:", signup.status, await signup.text());
  process.exit(1);
}
const { token } = await signup.json();
console.log("[setup] token acquired");

await page.addInitScript((t) => {
  localStorage.setItem("autistudy_token", t);
}, token);

await page.goto(`${BASE}/chat?subject=Maths`, { waitUntil: "networkidle" });
await sleep(1500);

const textarea = page.locator("textarea");
await textarea.waitFor({ state: "visible", timeout: 15000 });
await textarea.click();
await textarea.fill("what is 2/4 + 5/6?");
await textarea.press("Enter");

await page.waitForFunction(
  () => {
    const els = Array.from(document.querySelectorAll("*"));
    return els.some((el) => el.textContent && el.textContent.includes("means in terms of whole numbers"));
  },
  { timeout: 15000 },
);

await sleep(1000);

const checks = await page.evaluate(() => {
  const bubbles = Array.from(document.querySelectorAll(".markdown-body"));
  if (bubbles.length === 0) return { error: "No .markdown-body found" };
  const last = bubbles[bubbles.length - 1];
  const text = last.textContent || "";
  return {
    katexInlineCount: last.querySelectorAll(".katex").length,
    katexDisplayCount: last.querySelectorAll(".katex-display").length,
    mfracCount: last.querySelectorAll(".mfrac").length,
    hasRawFracText: text.includes("\\frac"),
    hasRawBackslashParen: text.includes("\\(") || text.includes("\\)"),
    hasRawBackslashBracket: text.includes("\\[") || text.includes("\\]"),
    hasStrong: last.querySelectorAll("strong").length,
    sampleText: text.slice(0, 200),
  };
});

console.log("\n=== Math render checks ===");
console.log(JSON.stringify(checks, null, 2));

const screenshotPath = "design-captures-variants/chat-math-render.png";
await page.screenshot({ path: screenshotPath, fullPage: false });
console.log(`\nScreenshot saved: ${screenshotPath}`);

let ok = true;
if (!checks.katexInlineCount || checks.katexInlineCount < 8) {
  console.error(`FAIL: expected many .katex spans, got ${checks.katexInlineCount}`);
  ok = false;
}
if (!checks.mfracCount || checks.mfracCount < 5) {
  console.error(`FAIL: expected several .mfrac (fraction) elements, got ${checks.mfracCount}`);
  ok = false;
}
if (checks.hasRawFracText) {
  console.error("FAIL: raw `\\frac` text still visible — KaTeX did not parse it");
  ok = false;
}
if (checks.hasRawBackslashParen || checks.hasRawBackslashBracket) {
  console.error("FAIL: raw `\\(`/`\\[` delimiters still visible");
  ok = false;
}

await browser.close();
if (ok) {
  console.log("\nALL CHECKS PASSED — math renders as real symbols via KaTeX.");
  process.exit(0);
} else {
  console.error("\nSome checks failed.");
  process.exit(1);
}
