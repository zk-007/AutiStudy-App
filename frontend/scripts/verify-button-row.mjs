/**
 * Quick visual check: confirm the action row under the last assistant
 * message shows BOTH the visual-aid button and the read-aloud button,
 * EVEN AFTER a picture / step card has already been attached.
 *
 * Reuses the `aidtest_1776770051609@autistudy.test` user (created earlier
 * by verify-visual-aid-router.mjs) — that user already has two chats with
 * a visual aid attached, so we don't have to wait for a fresh LLM call.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.WEB_BASE_URL || "http://localhost:3000";
const API = process.env.API_BASE_URL || "http://127.0.0.1:8000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("design-captures-variants", { recursive: true });

// Log in as a test user that already has chats with image_url + math_steps.
const login = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "aidtest_1776770051609@autistudy.test",
    password: "Pass1234!",
  }),
});
if (!login.ok) {
  console.error("login", login.status, await login.text());
  process.exit(1);
}
const { token } = await login.json();
const auth = { Authorization: `Bearer ${token}` };

// List sessions and pick the two we know about (countable + symbolic).
const sessRes = await fetch(`${API}/api/chat/sessions`, { headers: auth });
const sessions = await sessRes.json();
console.log(
  "[sessions]",
  sessions.map((s) => `${s.id} :: ${s.title}`),
);
const countableSession = sessions.find((s) => /2 \+ 4/.test(s.title));
const symbolicSession = sessions.find((s) => /2\/4/.test(s.title));
if (!countableSession || !symbolicSession) {
  console.error("Expected to find both seeded chats");
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const page = await ctx.newPage();
await page.addInitScript((t) => {
  localStorage.setItem("autistudy_token", t);
}, token);

async function probeButtons(sessionId, label) {
  await page.goto(`${BASE}/chat?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  // Wait until the chat composer textarea exists — that's our signal the
  // auth bootstrap finished and the conversation actually rendered. The
  // page first shows a "Loading your dashboard..." gate while the auth
  // provider validates the token.
  await page
    .waitForFunction(() => document.querySelectorAll("textarea").length > 0, null, {
      timeout: 30000,
      polling: 250,
    })
    .catch(() => console.error(`[${label}] textarea never appeared`));
  await sleep(1500);
  const probe = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button")).map((b) =>
      b.innerText.trim(),
    );
    return {
      hasShowPicture: buttons.some((l) => /Show me a picture/i.test(l)),
      hasAnotherPicture: buttons.some((l) => /Another picture/i.test(l)),
      hasReadAloud: buttons.some((l) => /Read aloud/i.test(l)),
      hasStop: buttons.some((l) => /^Stop$/i.test(l)),
    };
  });
  await page.screenshot({
    path: `design-captures-variants/button-row-${label}.png`,
    fullPage: false,
  });
  console.log(`[${label}]`, JSON.stringify(probe));
  return probe;
}

let ok = true;
const c = await probeButtons(countableSession.id, "with-image");
if (!c.hasAnotherPicture) {
  console.error("FAIL with-image: 'Another picture' label missing");
  ok = false;
}
if (!c.hasReadAloud) {
  console.error("FAIL with-image: 'Read aloud' button missing");
  ok = false;
}

const s = await probeButtons(symbolicSession.id, "with-stepcard");
if (!s.hasAnotherPicture) {
  console.error("FAIL with-stepcard: 'Another picture' label missing");
  ok = false;
}
if (!s.hasReadAloud) {
  console.error("FAIL with-stepcard: 'Read aloud' button missing");
  ok = false;
}

await browser.close();
if (ok) {
  console.log("\nPASS — visual-aid + read-aloud buttons sit together in the action row.");
  process.exit(0);
} else {
  process.exit(1);
}
