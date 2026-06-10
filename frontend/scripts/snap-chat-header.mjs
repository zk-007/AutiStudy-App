import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.WEB_BASE_URL || "http://localhost:3000";
const API = process.env.API_BASE_URL || "http://127.0.0.1:8000";
mkdirSync("design-captures-variants", { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 700 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const email = `hdrtest_${Date.now()}@autistudy.test`;
const r = await fetch(`${API}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "Pass1234!", name: "Hdr", grade: 4, role: "student" }),
});
const { token } = await r.json();
await page.addInitScript((t) => localStorage.setItem("autistudy_token", t), token);

// Stub message route so we get an instant reply, no LLM cost
await page.route("**/api/chat/sessions/*/messages", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user_message: { id: "u1", role: "user", content: "Hi", created_at: new Date().toISOString() },
      assistant_message: { id: "a1", role: "assistant", content: "Hello! Ask me anything.", created_at: new Date().toISOString() },
    }),
  });
});

await page.goto(`${BASE}/chat?subject=General%20Science`, { waitUntil: "networkidle" });
// Wait for the chat composer to appear (means auth + bootstrap done)
await page.locator("textarea").first().waitFor({ state: "visible", timeout: 20000 });
await page.waitForTimeout(800);

const dashboardLinks = await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll("a"));
  return links.filter((a) => a.textContent?.toLowerCase().includes("dashboard")).map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href") }));
});
console.log("Dashboard-related links on /chat:", JSON.stringify(dashboardLinks, null, 2));

await page.screenshot({ path: "design-captures-variants/chat-header-clean.png", fullPage: false });
console.log("Saved: design-captures-variants/chat-header-clean.png");
await browser.close();
