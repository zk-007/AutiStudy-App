/**
 * Open /chat?session=dc3f870a in a headless browser and dump everything
 * the page does — console messages, page errors, and every network
 * request (status + URL). Lets us see what's blocking the reload.
 */
import { chromium } from "playwright";

const BASE = process.env.WEB_BASE_URL || "http://localhost:3000";
const sessionId = process.argv[2] || "dc3f870a";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("console", (msg) => {
  const t = msg.type();
  if (t === "error" || t === "warning" || t === "info") {
    console.log(`[console.${t}]`, msg.text().slice(0, 300));
  }
});
page.on("requestfailed", (req) => {
  console.log(`[requestfailed] ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
});
page.on("response", (resp) => {
  const u = resp.url();
  if (/\/(api|_next)\//.test(u)) {
    console.log(`[net] ${resp.status()} ${resp.request().method()} ${u}`);
  }
});

console.log(`[goto] ${BASE}/chat?session=${sessionId}`);
await page.goto(`${BASE}/chat?session=${sessionId}`, { waitUntil: "domcontentloaded" });
await sleep(8000);

const probe = await page.evaluate(() => {
  return {
    url: location.href,
    title: document.title,
    bodyTextSnippet: document.body.innerText.slice(0, 600),
    hasToken: !!localStorage.getItem("autistudy_token"),
    tokenPreview: (localStorage.getItem("autistudy_token") || "").slice(0, 16),
    visibleTexts: [
      ...new Set(
        Array.from(document.querySelectorAll("h1, h2, h3, p, button"))
          .map((el) => el.textContent?.trim())
          .filter((s) => s && s.length > 0 && s.length < 80),
      ),
    ].slice(0, 20),
  };
});
console.log("\n=== PROBE ===");
console.log(JSON.stringify(probe, null, 2));

await page.screenshot({ path: "design-captures-variants/debug-session.png", fullPage: false });
await browser.close();
