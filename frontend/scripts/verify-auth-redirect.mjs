/**
 * End-to-end check of the "preserve URL across login wall" fix.
 *
 * Flow:
 *   1. Create a fresh user via the API (so we know the password).
 *   2. Create a chat session for that user via the API.
 *   3. In a brand-new headless browser (no token in localStorage), visit
 *      /chat?session=<that id>.
 *   4. Assert that the page bounced us to /login but kept ?next=/chat?session=...
 *   5. Submit the login form.
 *   6. Assert we end up back on /chat?session=<that id> (NOT /dashboard).
 */
import { chromium } from "playwright";

const WEB = process.env.WEB_BASE_URL || "http://localhost:3000";
const API = process.env.API_BASE_URL || "http://127.0.0.1:8000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ts = Date.now();
const email = `redir+${ts}@autistudy.test`;
const password = "TestPass123!";

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

console.log("[1/6] register user");
const reg = await api("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({
    name: "Redir Tester",
    email,
    password,
    grade: 4,
    role: "student",
  }),
});
const token = reg.token;
console.log("    token:", token.slice(0, 12), "...");

console.log("[2/6] create chat session");
const session = await api("/api/chat/sessions", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ subject: "General Science", grade: 4, language: "en" }),
});
const sessionId = session.id;
console.log("    sessionId:", sessionId);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log(`[3/6] visit /chat?session=${sessionId} while logged out`);
await page.goto(`${WEB}/chat?session=${sessionId}`, { waitUntil: "domcontentloaded" });
// Give the route guard time to run.
await page.waitForFunction(() => location.pathname === "/login", null, { timeout: 8000 });

const afterGuard = page.url();
console.log("    bounced to:", afterGuard);
const want = `/login?next=${encodeURIComponent("/chat?session=" + sessionId)}`;
if (!afterGuard.includes(want)) {
  console.error("    [FAIL] expected url to contain", want);
  await browser.close();
  process.exit(1);
}
console.log("    [OK] login URL preserves ?next=");

console.log("[4/6] fill in credentials and submit");
await page.locator('input[type="email"]').fill(email);
await page.locator('input[type="password"]').fill(password);
await Promise.all([
  page.waitForURL(`**/chat?session=${sessionId}`, { timeout: 15000 }),
  page.locator('button[type="submit"]').click(),
]);
console.log("    landed on:", page.url());

console.log("[5/6] confirm chat composer rendered");
await page.waitForFunction(() => document.querySelectorAll("textarea").length > 0, null, {
  timeout: 15000,
});

const probe = await page.evaluate(() => ({
  url: location.href,
  hasComposer: !!document.querySelector("textarea"),
  hasSendButton: Array.from(document.querySelectorAll("button")).some((b) =>
    /send/i.test(b.innerText || ""),
  ),
}));
console.log("[6/6] page state:", probe);

if (!probe.url.includes(`session=${sessionId}`)) {
  console.error("[FAIL] expected to land on the original session URL");
  await browser.close();
  process.exit(1);
}
if (!probe.hasComposer) {
  console.error("[FAIL] chat composer missing");
  await browser.close();
  process.exit(1);
}

console.log("\n[OK] auth-redirect round-trip works end-to-end.");
await browser.close();
