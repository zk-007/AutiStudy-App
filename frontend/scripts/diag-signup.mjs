import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

page.on("console", (msg) => console.log(`[console.${msg.type()}]`, msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message, "\n  stack:", err.stack?.split("\n").slice(0, 5).join("\n  ")));
page.on("requestfailed", (req) => console.log("[reqfail]", req.url(), req.failure()?.errorText));

console.log("Navigating to /signup ...");
await page.goto("http://localhost:3000/signup", { waitUntil: "networkidle", timeout: 20000 });

await new Promise((r) => setTimeout(r, 1500));

console.log("\nFilling form...");
await page.locator('input[placeholder="Your name"]').fill("DiagUser");
await page.locator('input[placeholder="Email address"]').fill(`diag+${Date.now()}@autistudy.local`);
await page.locator('input[placeholder="Password"]').fill("test1234");
await page.locator('button[type="button"]:has-text("6")').click();

console.log("Clicking submit...");
await page.locator('button[type="submit"]').click();
await new Promise((r) => setTimeout(r, 4000));

console.log("\nFinal URL:", page.url());
const errBox = await page.locator('[role="alert"]').textContent().catch(() => null);
console.log("Error banner text:", errBox);

await browser.close();
