import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const VIEWPORT = { width: 1440, height: 900 };
const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "design-captures-variants");

const VARIANTS = [
  { id: "svg-kid", label: "SVG: Happy kid + science/math/code orbs (NEW DEFAULT)" },
  { id: "svg-book", label: "SVG: Open book + 4 subject orbs (v2 default)" },
  { id: "photo-book", label: "PHOTO: Open book pages" },
  { id: "photo-desk", label: "PHOTO: Modern study desk" },
  { id: "photo-stack", label: "PHOTO: Stack of books" },
  { id: "photo-library", label: "PHOTO: Library shelves" },
  { id: "photo-notebook", label: "PHOTO: Open notebook + pen" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  for (const v of VARIANTS) {
    const url = `${BASE}/?visual=${v.id}&fast=1`;
    console.log("Capturing", v.id, "->", url);
    await page.goto(url, { waitUntil: "networkidle" });
    // Wait for hero to be present and images to load
    await page.waitForSelector("#hero", { timeout: 30000 });
    // For photo variants, also wait for the actual <img> to be loaded
    if (v.id.startsWith("photo-")) {
      await page.waitForFunction(
        () => {
          const img = document.querySelector("#hero img");
          return img && img.complete && img.naturalWidth > 0;
        },
        { timeout: 30000 }
      );
    }
    await sleep(1800);
    await page.screenshot({ path: path.join(OUT, `${v.id}.png`), fullPage: false });
  }

  await browser.close();
  console.log("Captures ->", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
