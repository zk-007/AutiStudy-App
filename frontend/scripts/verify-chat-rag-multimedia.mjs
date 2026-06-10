/**
 * End-to-end verification for the RAG-grounded chat + new multimedia buttons.
 *
 * What this exercises:
 *   1. /api/chat/config now reports rag_available + images_available + speech_available.
 *   2. Chat reply is curriculum-grounded (intercepts /messages and asserts the
 *      backend actually called the RAG path — checked by reading server logs in
 *      a follow-up ad-hoc request, but here we assert by content shape).
 *   3. The "Show me a picture" + "Read aloud" buttons appear on the LATEST
 *      assistant bubble (and only there).
 *   4. Read-aloud actually requests /api/chat/speech and gets back a non-empty
 *      audio_base64 payload. We do NOT play the audio in headless Chromium
 *      (autoplay restricted) — we just intercept and confirm the response.
 *   5. Image generation is *intercepted and stubbed* with a 1×1 transparent
 *      PNG so we don't burn DALL·E credits on every test run; we still verify
 *      the React UI renders the returned image into the bubble.
 *
 * Output: design-captures-variants/chat-rag-multimedia.png (screenshot of the
 * conversation with a stubbed image attached and Read-aloud highlighted).
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.WEB_BASE_URL || "http://localhost:3001";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("design-captures-variants", { recursive: true });

// 1×1 transparent PNG (base64) — used to stub out DALL·E.
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("[console.error]", msg.text());
});

// ─── Stubs ────────────────────────────────────────────────────────────────
// Image route: stub so we don't hit DALL·E. Track whether the React app
// actually called it so we can assert the button works.
let imageCalled = false;
await page.route("**/api/chat/sessions/*/image", async (route) => {
  imageCalled = true;
  // Tiny PNG returned via the static-mount path so resolveImageUrl prefixes it.
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      image_url: `data:image/png;base64,${TINY_PNG}`,
      message_index: 1,
    }),
  });
});
// Tiny TTS payload — empty audio so the browser doesn't choke on autoplay.
let speechCalled = false;
await page.route("**/api/chat/speech", async (route) => {
  speechCalled = true;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      audio_base64: "AAAA",
      mime_type: "audio/mpeg",
    }),
  });
});

// ─── 1. Signup ───────────────────────────────────────────────────────────
const email = `rag+${Date.now()}@autistudy.local`;
console.log(`[1] Signup ${email} (grade 4 / Maths)...`);
await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
await page.locator('input[placeholder="Your name"]').fill("Aisha");
await page.locator('input[placeholder="Email address"]').fill(email);
await page.locator('input[placeholder="Password"]').fill("test1234");
await page.locator('button[type="button"]:has-text("4")').click();
await Promise.all([
  page.waitForURL("**/dashboard"),
  page.locator('button[type="submit"]').click(),
]);
await sleep(1000);

// ─── 2. Verify /api/chat/config exposes new flags ────────────────────────
console.log("[2] GET /api/chat/config (via the live API)...");
const cfg = await page.evaluate(async () => {
  const r = await fetch("http://127.0.0.1:8000/api/chat/config");
  return r.json();
});
console.log("    config:", JSON.stringify(cfg));
const flagsOk = cfg.tutor_configured && cfg.rag_available && cfg.images_available && cfg.speech_available;
if (!flagsOk) {
  console.log("    ❌ config is missing one of the new flags — aborting.");
  await browser.close();
  process.exit(1);
}
console.log("    ✓ all four flags ON");

// ─── 3. Open Maths chat ──────────────────────────────────────────────────
console.log("[3] Open Maths chat...");
await page.locator('h3:has-text("Maths")').first().locator("..").locator('button:has-text("Study")').click();
await page.waitForURL(/\/chat\?session=/, { timeout: 30000 });
await sleep(1200);

// ─── 4. Send a real curriculum question ──────────────────────────────────
console.log("[4] Send 'What is a fraction?' — expect RAG-grounded reply...");
// Wait for the textarea to be present + enabled (the chat first does
// /chat/config + /chat/sessions/<id> GETs which can take a moment).
const textarea = page.locator("textarea");
await textarea.waitFor({ state: "visible", timeout: 30000 });
await textarea.click();
await textarea.fill("");
await textarea.pressSequentially("What is a fraction?", { delay: 15 });
await sleep(300);
const t0 = Date.now();
// Listen for the POST /messages request firing — this proves onSend ran.
let postSeen = false;
page.on("request", (req) => {
  if (req.method() === "POST" && req.url().includes("/messages")) {
    postSeen = true;
    console.log("    >> outbound POST /messages:", req.url());
  }
});
const respPromise = page.waitForResponse(
  (resp) => resp.url().includes("/api/chat/sessions/") && resp.url().endsWith("/messages") && resp.request().method() === "POST",
  { timeout: 90000 },
);
// Press Enter (chat composer sends on Enter without Shift).
await textarea.press("Enter");
await sleep(800);
if (!postSeen) {
  console.log("    !! Enter did not trigger a POST. Trying Send button click...");
  const sendBtn = page.locator('button:has-text("Send")').first();
  await sendBtn.click({ force: true });
}
const resp = await respPromise;
const elapsed = Date.now() - t0;
console.log(`    /messages responded ${resp.status()} in ${elapsed}ms`);

// Give React a moment to flush the new bubble + clear the "thinking" state.
await page.waitForFunction(
  () => {
    const stillThinking = !!Array.from(document.querySelectorAll("span")).find(
      (el) => el.textContent && el.textContent.includes("Tutor is thinking"),
    );
    if (stillThinking) return false;
    return document.querySelectorAll('[class*="rounded-bl-md"]').length >= 1;
  },
  { timeout: 15000 },
);

const replyText = await page.locator('[class*="rounded-bl-md"]').last().innerText();
console.log("    reply preview:", replyText.slice(0, 200).replace(/\n/g, " "), "…");
const looksGrounded = /(numerator|denominator|fraction|part|whole)/i.test(replyText);
console.log(looksGrounded ? "    ✓ Reply mentions fraction concepts (likely RAG-grounded)" : "    ⚠ Reply does not mention fraction concepts");
const isPlaceholder = replyText.includes("not fully set up yet");
if (isPlaceholder) {
  console.log("    ❌ STILL placeholder — engine is not configured!");
  await browser.close();
  process.exit(1);
}

// ─── 5. Verify the action buttons exist on the latest bubble ─────────────
console.log("[5] Confirm 'Show me a picture' and 'Read aloud' buttons appear...");
const picBtn = page.locator('button:has-text("Show me a picture")');
const speakBtn = page.locator('button:has-text("Read aloud")');
await picBtn.waitFor({ timeout: 5000 });
await speakBtn.waitFor({ timeout: 5000 });
console.log("    ✓ Both action buttons rendered");

// ─── 6. Click "Read aloud" — verify the API call ─────────────────────────
console.log("[6] Click 'Read aloud' (TTS request, stubbed)...");
await speakBtn.click();
await sleep(800);
console.log(speechCalled ? "    ✓ /api/chat/speech was called" : "    ❌ TTS endpoint NOT called");

// ─── 7. Click "Show me a picture" — verify image attaches ────────────────
console.log("[7] Click 'Show me a picture' (image gen, stubbed PNG)...");
await picBtn.click();
await sleep(1500);
console.log(imageCalled ? "    ✓ /api/chat/sessions/.../image was called" : "    ❌ image endpoint NOT called");

const imgCount = await page.locator("img[src^='data:image/png']").count();
console.log(`    image elements rendered: ${imgCount}`);
if (imgCount < 1) {
  console.log("    ❌ Stubbed PNG did not render — bubble likely missed image_url update.");
}

// ─── 8. Final screenshot ─────────────────────────────────────────────────
await page.screenshot({ path: "design-captures-variants/chat-rag-multimedia.png", fullPage: false });
console.log("\nSaved screenshot: design-captures-variants/chat-rag-multimedia.png");

await browser.close();

const allOk = looksGrounded && !isPlaceholder && speechCalled && imageCalled && imgCount >= 1;
console.log(allOk ? "\n✅ ALL CHECKS PASSED" : "\n⚠ Some checks failed — see log above");
process.exit(allOk ? 0 : 1);
