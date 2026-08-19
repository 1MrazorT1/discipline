const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const DIST_DIR = path.join(process.cwd(), "dist");
const BASE_PATH = "/discipline";

/**
 * Apply the same asset-path fix that CI does: rewrite bare
 * `_expo/` and `favicon.ico` references in index.html to include
 * the `/discipline/` base path. Also create 404.html (SPA fallback)
 * and .nojekyll so GitHub Pages doesn't ignore `_`-prefixed directories.
 */
function prepareDist() {
  const indexPath = path.join(DIST_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, "utf8");
    if (!html.includes('href="/discipline/_expo/')) {
      html = html
        .replace(/href="\/_expo\//g, 'href="/discipline/_expo/')
        .replace(/src="\/_expo\//g, 'src="/discipline/_expo/')
        .replace(/href="\/favicon.ico"/g, 'href="/discipline/favicon.ico"');
      fs.writeFileSync(indexPath, html);
    }
  }
  // Create 404.html if missing (SPA fallback)
  const notFoundPath = path.join(DIST_DIR, "404.html");
  if (!fs.existsSync(notFoundPath) && fs.existsSync(indexPath)) {
    fs.copyFileSync(indexPath, notFoundPath);
  }
  // Create .nojekyll so GitHub Pages doesn't ignore _-prefixed dirs
  const nojekyllPath = path.join(DIST_DIR, ".nojekyll");
  if (!fs.existsSync(nojekyllPath)) {
    fs.writeFileSync(nojekyllPath, "");
  }
}

prepareDist();

// Static file server with SPA fallback
const server = http.createServer((req, res) => {
  let urlPath = req.url?.split("?")[0] || "/";

  // Strip the /discipline prefix to find files in dist/
  if (urlPath.startsWith(BASE_PATH)) {
    urlPath = urlPath.slice(BASE_PATH.length) || "/";
  }

  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(DIST_DIR, urlPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".ico": "image/x-icon",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".json": "application/json",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".eot": "application/vnd.ms-fontobject",
    };
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(fs.readFileSync(filePath));
  } else {
    // SPA fallback: serve 404.html (same as index.html)
    const fallback = path.join(DIST_DIR, "404.html");
    if (fs.existsSync(fallback)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(fs.readFileSync(fallback));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  }
});

async function runTests() {
  await new Promise((resolve) => server.listen(3999, resolve));
  console.log("✅ Static server running on http://localhost:3999");
  console.log(`   Testing at: http://localhost:3999${BASE_PATH}/`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const consoleMessages = [];

  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("requestfailed", (req) => {
    const failure = req.failure();
    if (failure) {
      errors.push(`Request failed: ${req.url()} - ${failure.errorText}`);
    }
  });

  console.log("\n⏳ Loading app...");
  const testUrl = `http://localhost:3999${BASE_PATH}/`;
  await page.goto(testUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);

  console.log("\n=== Test Results ===\n");

  // 1. Check title
  const title = await page.title();
  console.log(`Title: "${title}"`);
  console.log(`  → ${title === "Discipline" ? "✅ PASS" : "❌ FAIL"} (expected "Discipline")`);

  // 2. Check root div has content
  const rootHTML = await page.evaluate(() => {
    const root = document.getElementById("root");
    if (!root) return "ROOT NOT FOUND";
    return root.innerHTML.substring(0, 500);
  });
  console.log(`Root div content length: ${rootHTML.length}`);
  console.log(`  → ${rootHTML.length > 50 ? "✅ PASS (content rendered)" : "❌ FAIL (empty root)"}`);

  // 3. Check for critical JS errors
  const criticalErrors = errors.filter((e) => !e.includes("ResizeObserver"));
  console.log(`\nJS errors: ${criticalErrors.length}`);
  if (criticalErrors.length > 0) {
    console.log("  ❌ Errors:");
    criticalErrors.forEach((e) => console.log(`     - ${e.substring(0, 200)}`));
  } else {
    console.log("  ✅ PASS (no critical JS errors)");
  }

  // 4. Check console warnings/errors
  const allConsole = consoleMessages.filter((m) => m.includes("[error]") || m.includes("[warning]"));
  console.log(`\nConsole messages: ${allConsole.length}`);
  if (allConsole.length > 0) {
    allConsole.slice(0, 10).forEach((m) => console.log(`  ${m.substring(0, 200)}`));
  }

  // 5. Check that "Unmatched Route" is NOT present
  const bodyText = await page.evaluate(() => document.body.innerText || "");
  const hasUnmatchedRoute = bodyText.includes("Unmatched Route");
  console.log(`\nUnmatched Route shown: ${hasUnmatchedRoute ? "❌ FAIL" : "✅ PASS (not shown)"}`);

  // 6. Check for visible app text
  const hasAppText =
    bodyText.includes("Discipline") ||
    bodyText.includes("Log in") ||
    bodyText.includes("Create") ||
    bodyText.includes("Track meals");
  console.log(`App rendered UI text: ${hasAppText ? "✅ PASS" : "❌ FAIL"}`);
  if (bodyText.length > 0) {
    console.log(`  Body text (first 200 chars): "${bodyText.substring(0, 200)}"`);
  }

  // 7. Check that JS bundle loaded
  const jsLoaded = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[src]');
    return scripts.length > 0;
  });
  console.log(`\nJS bundle loaded: ${jsLoaded ? "✅ PASS" : "❌ FAIL"}`);

  // 8. Take screenshot
  await page.screenshot({
    path: path.join(process.cwd(), "dist-web-screenshot.png"),
    fullPage: true,
  });
  console.log("\n📸 Screenshot saved: dist-web-screenshot.png");

  // 9. Check loaded resources
  const resources = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("link[rel], script[src]"))
      .map((el) => {
        const src = el.src || el.href;
        return el.tagName + ": " + src.substring(0, 80);
      })
      .slice(0, 10);
  });
  console.log("\nLoaded resources:");
  resources.forEach((r) => console.log(`  - ${r}`));

  // Summary
  console.log("\n=== Final Summary ===");
  const allPass =
    title === "Discipline" &&
    rootHTML.length > 50 &&
    !hasUnmatchedRoute &&
    hasAppText &&
    criticalErrors.length === 0;
  console.log(`  Title correct: ${title === "Discipline" ? "✅" : "❌"}`);
  console.log(`  Root rendered: ${rootHTML.length > 50 ? "✅" : "❌"}`);
  console.log(`  No "Unmatched Route": ${!hasUnmatchedRoute ? "✅" : "❌"}`);
  console.log(`  UI visible: ${hasAppText ? "✅" : "❌"}`);
  console.log(`  No JS errors: ${criticalErrors.length === 0 ? "✅" : "❌"}`);
  console.log(`  Overall: ${allPass ? "✅ ALL PASS" : "❌ FAILURES"}`);
  console.log("");

  await browser.close();
  server.close();

  if (!allPass) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  try { server.close(); } catch (e) {}
  process.exit(1);
});
