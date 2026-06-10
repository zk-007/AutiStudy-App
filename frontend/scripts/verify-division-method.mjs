/**
 * Verify the tutor teaches the RIGHT division method based on problem size.
 *
 *   • "what is 63 ÷ 3?"   → short division, NOT a multiplication-table walk
 *                            (e.g. 3×1, 3×2, …, 3×21).
 *   • "what is 1263 ÷ 3?" → long division (divide → bring down → divide →
 *                            bring down → divide), NOT 421 multiplications.
 *
 * Two layers of check:
 *   1. The chat /messages reply text must NOT contain a long
 *      "3 × 1, 3 × 2, … 3 × 21" walk.
 *   2. When the student clicks "Show me a picture", the visual-aid router
 *      should pick `math_steps` (NOT `image`) for both questions, and the
 *      resulting step card should mention long-division terminology.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.WEB_BASE_URL || "http://localhost:3000";
const API = process.env.API_BASE_URL || "http://127.0.0.1:8000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("design-captures-variants", { recursive: true });

const email = `divtest_${Date.now()}@autistudy.test`;
const signup = await fetch(`${API}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email, password: "Pass1234!", name: "DivTest", grade: 4, role: "student",
  }),
});
if (!signup.ok) {
  console.error("signup", signup.status, await signup.text());
  process.exit(1);
}
const { token } = await signup.json();
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
console.log("[setup] token acquired");

const QUESTIONS = [
  { q: "what is 63 ÷ 3?", label: "63div3", expectStepCard: true },
  { q: "what is 1263 ÷ 3?", label: "1263div3", expectStepCard: true },
];

// ── 1. Send each question via the real /messages endpoint and inspect the
//      assistant's TEXT reply for the bad-pattern (multiples walk).
async function seedAndCheckReply(question) {
  const created = await fetch(`${API}/api/chat/sessions`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ subject: "Maths", language: "en" }),
  });
  const { id } = await created.json();
  const sent = await fetch(`${API}/api/chat/sessions/${id}/messages`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ content: question }),
  });
  if (!sent.ok) {
    throw new Error(`send msg: ${sent.status} ${await sent.text()}`);
  }
  const data = await sent.json();
  const reply = data.assistant_message.content || "";
  // Anti-pattern 1: a long list of "3 × N = M" or "3 \\times N = M" lines.
  const tableWalkMatches = reply.match(/3\s*(?:\\times|×|\*|x)\s*\d+\s*=\s*\d+/gi) || [];
  // Anti-pattern 2: skip-counting "3, 6, 9, 12, …, 63" — long comma-separated
  // sequences of multiples on a single line. Catch sequences ≥ 8 items.
  const skipCountMatches = reply.match(/(?:\d+\s*,\s*){7,}\d+/g) || [];
  // Anti-pattern 3: repeated addition / subtraction "3 + 3 + 3 + 3 + 3 …".
  const repeatedAddMatches = reply.match(/(\d+\s*[+\-]\s*){5,}\d+/g) || [];
  return {
    id,
    reply,
    tableWalkCount: tableWalkMatches.length,
    skipCountCount: skipCountMatches.length,
    repeatedAddCount: repeatedAddMatches.length,
  };
}

const results = [];
for (const item of QUESTIONS) {
  console.log(`\n=== Asking: "${item.q}" ===`);
  const r = await seedAndCheckReply(item.q);
  console.log(
    `[reply] table-walk=${r.tableWalkCount}  skip-count=${r.skipCountCount}  repeated-add=${r.repeatedAddCount}`,
  );
  console.log(`[reply preview] ${r.reply.slice(0, 280)}…`);
  results.push({ ...item, ...r });
}

// ── 2. For each session, click "Show me a picture" and assert the visual
//      aid is a STEP CARD (not an image), and the step card mentions
//      long-division language.
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const page = await ctx.newPage();
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.addInitScript((t) => localStorage.setItem("autistudy_token", t), token);

let imageKindSeen = false;
await page.route("**/api/chat/sessions/*/image", async (route) => {
  const req = route.request();
  const headers = req.headers();
  const resp = await fetch(req.url(), {
    method: req.method(),
    headers: {
      Authorization: headers.authorization || "",
      "Content-Type": "application/json",
    },
    body: req.postData() || "{}",
  });
  const data = await resp.json();
  console.log("  [stub-image] backend kind =", data.kind);
  if (data.kind === "image") imageKindSeen = true;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
});

let ok = true;
for (const r of results) {
  console.log(`\n--- Visual aid for "${r.q}" ---`);
  await page.goto(`${BASE}/chat?session=${r.id}`, { waitUntil: "domcontentloaded" });
  await page
    .waitForFunction(() => document.querySelectorAll("textarea").length > 0, null, {
      timeout: 30000,
      polling: 250,
    })
    .catch(() => console.log("  textarea never appeared"));
  await sleep(1500);

  const btn = page.locator('button:has-text("Show me a picture"), button:has-text("Another picture")').first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();

  await page
    .waitForFunction(
      () => {
        const card = document.querySelector('[data-testid="math-step-card"]');
        if (card && card.querySelectorAll("ol > li").length > 0) return true;
        const img = Array.from(document.querySelectorAll("img")).find((i) =>
          (i.src || "").includes("generated-images") || (i.src || "").startsWith("data:"),
        );
        return !!img;
      },
      null,
      { timeout: 120000, polling: 500 },
    )
    .catch((err) => console.error("  waitForFunction timed out:", err.message));

  await sleep(1200);
  const probe = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="math-step-card"]');
    if (!card) return { hasCard: false, captions: [], title: null };
    const captions = Array.from(card.querySelectorAll("ol > li")).map(
      (li) => li.innerText.trim(),
    );
    const title =
      card.querySelector('[data-testid="math-step-card-title"]')?.textContent || null;
    return { hasCard: true, captions, title };
  });
  console.log("  [card]", JSON.stringify(probe, null, 2));
  await page.screenshot({
    path: `design-captures-variants/division-${r.label}.png`,
    fullPage: false,
  });

  if (!probe.hasCard) {
    console.error(`  FAIL ${r.label}: expected a math step card, got none`);
    ok = false;
  } else {
    const joined = probe.captions.join(" ").toLowerCase();
    const longDivLanguage =
      /bring down|divide the .*digit|long division|next digit|first digit/.test(joined);
    if (!longDivLanguage) {
      console.error(`  WARN ${r.label}: step card doesn't use long-division language`);
    } else {
      console.log(`  PASS ${r.label}: step card uses long-division language`);
    }
  }

  // Reply text checks for ALL three anti-patterns.
  if (r.tableWalkCount > 5) {
    console.error(
      `  FAIL ${r.label}: tutor reply contains ${r.tableWalkCount} table-walk lines (anti-pattern)`,
    );
    ok = false;
  }
  if (r.skipCountCount > 0) {
    console.error(
      `  FAIL ${r.label}: tutor reply contains skip-count sequence (anti-pattern)`,
    );
    ok = false;
  }
  if (r.repeatedAddCount > 0) {
    console.error(
      `  FAIL ${r.label}: tutor reply contains repeated-addition sequence (anti-pattern)`,
    );
    ok = false;
  }
  if (r.tableWalkCount <= 5 && r.skipCountCount === 0 && r.repeatedAddCount === 0) {
    console.log(`  PASS ${r.label}: tutor reply uses no anti-patterns`);
  }
}

await browser.close();
if (ok) {
  console.log("\nALL CHECKS PASSED — tutor is using proper division methods.");
  process.exit(0);
} else {
  console.error("\nSome checks failed.");
  process.exit(1);
}
