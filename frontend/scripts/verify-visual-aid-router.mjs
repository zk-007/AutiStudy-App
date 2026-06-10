/**
 * Verify the 3-way visual-aid router from the React UI through the FastAPI
 * backend.
 *
 *   • Question A: "what is 2 + 4?"     → expect TRACK = countable → image
 *   • Question B: "what is 2/4 + 5/6?" → expect TRACK = symbolic  → step card
 *
 * Strategy:
 *   1. Sign up via API (fast, deterministic).
 *   2. For each question, create a chat session and append BOTH the user
 *      message and a stub assistant reply directly via the API utilities.
 *      This skips the slow real-LLM chat reply (the visual-aid endpoint
 *      doesn't depend on the assistant's *text* — only on the user's
 *      latest question).
 *   3. Load the chat page with `?session=<id>`.
 *   4. Click the "Show me a picture" button.
 *   5. For countable: stub the DALL·E response with a 1×1 PNG so we don't
 *      spend on real image generation, then assert an <img> renders.
 *   6. For symbolic: let the real GPT-4o-mini call run for the JSON step
 *      card (no DALL·E), then assert the KaTeX step card renders.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.WEB_BASE_URL || "http://localhost:3000";
const API = process.env.API_BASE_URL || "http://127.0.0.1:8000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("design-captures-variants", { recursive: true });

const TINY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

// ── 1. Sign up ────────────────────────────────────────────────────────────
const email = `aidtest_${Date.now()}@autistudy.test`;
const signup = await fetch(`${API}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email,
    password: "Pass1234!",
    name: "AidTest",
    grade: 4,
    role: "student",
  }),
});
if (!signup.ok) {
  console.error("Signup failed:", signup.status, await signup.text());
  process.exit(1);
}
const { token } = await signup.json();
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
console.log("[setup] token acquired");

// ── 2. Seed sessions via API ──────────────────────────────────────────────
async function seedSession(question, stubReply) {
  const created = await fetch(`${API}/api/chat/sessions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ subject: "Maths", language: "en" }),
  });
  if (!created.ok) throw new Error(`create session: ${created.status}`);
  const { id } = await created.json();
  // Send the user message via the real /messages endpoint so it's persisted
  // identically to a UI message. The assistant reply that comes back is fine
  // — we don't need it for the visual aid (only the user message matters).
  const sent = await fetch(`${API}/api/chat/sessions/${id}/messages`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ content: question }),
  });
  if (!sent.ok) {
    console.error("send msg:", sent.status, await sent.text());
    throw new Error("send message failed");
  }
  console.log(`[seed] session ${id} :: ${question}`);
  return id;
}

// ── 3. Browser ────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("console", (msg) => {
  const t = msg.type();
  if (t === "error" || t === "warning") {
    console.log(`[console.${t}]`, msg.text().slice(0, 200));
  }
});

// Stub the visual-aid endpoint: forward to the real backend, then if the
// backend chose the "image" track, swap the URL for our tiny PNG so we
// don't pay DALL·E. Step-card responses pass through unmodified so we
// verify the *real* JSON the backend produces.
await page.route("**/api/chat/sessions/*/image", async (route) => {
  const req = route.request();
  try {
    const headers = req.headers();
    const resp = await fetch(req.url(), {
      method: req.method(),
      headers: {
        Authorization: headers.authorization || "",
        "Content-Type": "application/json",
      },
      body: req.postData() || "{}",
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      console.log(`[stub-image] backend ${resp.status}: ${errBody.slice(0, 200)}`);
      await route.fulfill({ status: resp.status, body: errBody });
      return;
    }
    const data = await resp.json();
    console.log(
      "[stub-image] backend kind=",
      data.kind,
      "steps=",
      data.math_steps?.steps?.length,
    );
    if (data.kind === "image") data.image_url = TINY_PNG_DATA_URI;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.error("[stub-image] forward failed:", err);
    await route.fulfill({ status: 500, body: String(err) });
  }
});

await page.addInitScript((t) => {
  localStorage.setItem("autistudy_token", t);
}, token);

// ── 4. Helper ─────────────────────────────────────────────────────────────
async function runOne(sessionId, label) {
  console.log(`\n=== ${label} :: session ${sessionId} ===`);
  await page.goto(`${BASE}/chat?session=${sessionId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await sleep(2500);

  // Wait until the user's question shows up in a bubble.
  await page.waitForFunction(
    () => document.querySelectorAll("textarea").length > 0,
    { timeout: 30000 },
  );
  await sleep(1500); // let session fetch + render settle

  const btn = page.locator('button:has-text("Show me a picture")').first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  console.log("[runOne] clicking visual-aid button");
  await btn.click();

  // NOTE: waitForFunction signature is (fn, arg, options). Passing options
  // as the 2nd argument silently makes them the `arg` and the timeout falls
  // back to the 30s default — that's why DALL·E (which can take 40-60s)
  // looked like it was "timing out before the stub-image log printed".
  await page
    .waitForFunction(
      () => {
        const hasImg = Array.from(document.querySelectorAll("img")).some((i) =>
          (i.src || "").startsWith("data:image/png"),
        );
        // Card-scoped: avoids matching unrelated lists in chat history.
        const card = document.querySelector('[data-testid="math-step-card"]');
        const hasCardSteps = !!card && card.querySelectorAll("ol > li").length > 0;
        return hasImg || hasCardSteps;
      },
      null,
      { timeout: 120000, polling: 500 },
    )
    .catch((err) => {
      console.error(`[runOne:${label}] waitForFunction timed out`, err.message);
    });

  await sleep(1200);

  const probe = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"))
      .map((i) => i.src.slice(0, 50))
      .filter((s) => s.startsWith("data:") || s.includes("generated-images"));
    // Scope step-card metrics to the dedicated card so assistant-text
    // fractions don't pollute the count.
    const card = document.querySelector('[data-testid="math-step-card"]');
    const cardKatex = card ? card.querySelectorAll(".katex").length : 0;
    const cardMfrac = card ? card.querySelectorAll(".mfrac").length : 0;
    const cardStepItems = card ? card.querySelectorAll("ol > li").length : 0;
    const cardTitle = card?.querySelector('[data-testid="math-step-card-title"]')
      ?.textContent || null;
    return { imgs, cardKatex, cardMfrac, cardStepItems, cardTitle };
  });

  console.log(JSON.stringify(probe, null, 2));
  await page.screenshot({
    path: `design-captures-variants/visual-aid-${label}.png`,
    fullPage: false,
  });
  return probe;
}

// ── 5. Run both tracks ────────────────────────────────────────────────────
let ok = true;

const idA = await seedSession("what is 2 + 4?");
const a = await runOne(idA, "countable");
if (!a.imgs.some((s) => s.startsWith("data:image/png"))) {
  console.error("FAIL countable: expected stubbed PNG <img> to render");
  ok = false;
} else {
  console.log("PASS countable: image rendered");
}
if (a.cardStepItems > 0) {
  console.error("FAIL countable: step card unexpectedly rendered (should be image)");
  ok = false;
}

const idB = await seedSession("what is 2/4 + 5/6?");
const b = await runOne(idB, "symbolic");
if (b.cardStepItems < 2) {
  console.error(`FAIL symbolic: expected ≥2 step <li> in card, got ${b.cardStepItems}`);
  ok = false;
} else {
  console.log(`PASS symbolic: ${b.cardStepItems} step list items in card`);
}
if (b.cardMfrac < 2) {
  console.error(`FAIL symbolic: expected ≥2 .mfrac in card, got ${b.cardMfrac}`);
  ok = false;
} else {
  console.log(`PASS symbolic: ${b.cardMfrac} fractions typeset inside card`);
}
console.log(`[symbolic] card title: ${b.cardTitle}`);

await browser.close();
if (ok) {
  console.log("\nALL CHECKS PASSED — visual-aid router is working end-to-end.");
  process.exit(0);
} else {
  console.error("\nSome checks failed.");
  process.exit(1);
}
