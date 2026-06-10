/**
 * Show what the polished dashboard looks like when the user actually has
 * some progress. We mock the API responses at the network layer so we can
 * see populated stats + recent quizzes without taking real quizzes.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("design-captures-variants", { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// First, sign up a real user (so we have a valid token).
const email = `polish-stats+${Date.now()}@autistudy.local`;
await page.goto("http://localhost:3000/signup", { waitUntil: "networkidle" });
await page.locator('input[placeholder="Your name"]').fill("Ayan");
await page.locator('input[placeholder="Email address"]').fill(email);
await page.locator('input[placeholder="Password"]').fill("test1234");
await page.locator('button[type="button"]:has-text("6")').click();
await Promise.all([
  page.waitForURL("**/dashboard", { timeout: 30000 }),
  page.locator('button[type="submit"]').click(),
]);

// Now intercept follow-up dashboard data fetches with rich mock data.
await page.route("**/api/users/me/stats", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      stars: 47,
      streak_days: 7,
      total_quizzes: 12,
      total_questions: 60,
      total_correct: 51,
      overall_accuracy: 85,
      total_time_minutes: 96,
      daily_activity: [],
      subject_breakdown: {},
    }),
  }),
);

await page.route("**/api/users/me/recent-chats", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([
      {
        id: "c1",
        subject: "General Science",
        title: "Photosynthesis explained",
        timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        language: "en",
        message_count: 14,
        last_message_snippet: "So the chloroplast is what captures the sunlight…",
      },
      {
        id: "c2",
        subject: "Maths",
        title: "Long division steps",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
        language: "en",
        message_count: 8,
        last_message_snippet: "Great — let's try one with a remainder this time.",
      },
      {
        id: "c3",
        subject: "Computer",
        title: "What is a loop?",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
        language: "en",
        message_count: 6,
        last_message_snippet: "A loop is when the computer repeats something for you…",
      },
    ]),
  }),
);

await page.route("**/api/users/me/recent-quizzes", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([
      { id: "q1", subject: "Maths", grade: 6, score_percent: 90, num_correct: 9, num_questions: 10, timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString() },
      { id: "q2", subject: "General Science", grade: 6, score_percent: 75, num_correct: 6, num_questions: 8, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString() },
      { id: "q3", subject: "Computer", grade: 6, score_percent: 50, num_correct: 5, num_questions: 10, timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString() },
    ]),
  }),
);

await page.route("**/api/users/me/subjects", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([
      { name: "Maths", icon: "🔢", grade: 6, last_studied: new Date(Date.now() - 1000 * 60 * 90).toISOString() },
      { name: "General Science", icon: "🔬", grade: 6, last_studied: new Date(Date.now() - 1000 * 60 * 35).toISOString() },
      { name: "Computer", icon: "💻", grade: 6, last_studied: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString() },
    ]),
  }),
);

// Reload to trigger the fetches with our intercepts in place.
await page.reload({ waitUntil: "networkidle" });
await sleep(500); // mid count-up
await page.screenshot({ path: "design-captures-variants/dashboard-v8-counting.png", fullPage: true });
console.log("Saved mid-animation screenshot");
await sleep(1500); // animation finished
await page.screenshot({ path: "design-captures-variants/dashboard-v8-populated.png", fullPage: true });
console.log("Saved final populated screenshot");

await browser.close();
console.log("\nDone.");
