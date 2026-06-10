import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000/?fast=1", { waitUntil: "networkidle" });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: "design-captures-variants/restored.png" });
await browser.close();
console.log("OK");
