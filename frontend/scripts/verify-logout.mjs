import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Login as the existing E2E user
console.log("Logging in...");
await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });

// Use the test user we just created via signup
const email = `loguser+${Date.now()}@autistudy.local`;
await page.goto("http://localhost:3000/signup", { waitUntil: "networkidle" });
await page.locator('input[placeholder="Your name"]').fill("LogoutUser");
await page.locator('input[placeholder="Email address"]').fill(email);
await page.locator('input[placeholder="Password"]').fill("test1234");
await page.locator('button[type="button"]:has-text("5")').click();
await Promise.all([
  page.waitForURL("**/dashboard", { timeout: 30000 }),
  page.locator('button[type="submit"]').click(),
]);
console.log("Logged in, on:", page.url());
await new Promise((r) => setTimeout(r, 1500));

console.log("\nClicking Log out...");
await page.locator('button[aria-label="Log out"]').click();

// Wait for navigation to complete
await page.waitForURL((url) => !url.pathname.includes("dashboard"), { timeout: 8000 });
console.log("After logout, on:", page.url());

// Verify localStorage was cleared
const tok = await page.evaluate(() => localStorage.getItem("autistudy_token"));
console.log("Token in localStorage:", tok === null ? "(cleared) PASS" : tok);

// Try visiting /dashboard while logged out - should redirect to /login
console.log("\nVisiting /dashboard while logged out...");
await page.goto("http://localhost:3000/dashboard");
await page.waitForURL("**/login", { timeout: 8000 }).catch(() => null);
console.log("Final URL:", page.url(), page.url().includes("/login") ? "PASS" : "(should be /login)");

await browser.close();
console.log("\nDone.");
