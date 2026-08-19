const { chromium } = require("playwright");

async function testLiveUrl() {
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
    errors.push(`Failed: ${req.url()} - ${req.failure()?.errorText}`);
  });

  console.log("⏳ Loading https://1mrazort1.github.io/discipline/...");
  await page.goto("https://1mrazort1.github.io/discipline/", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(5000);

  console.log("\n=== Live Site Test Results ===\n");

  const title = await page.title();
  console.log(`Title: "${title}"`);
  console.log(`  → ${title === "Discipline" ? "✅ PASS" : "❌ FAIL"}`);

  const bodyText = await page.evaluate(() => document.body.innerText || "");
  console.log(`\nBody text: "${bodyText.substring(0, 200)}"`);
  console.log(`  → ${bodyText.length > 0 ? "✅ PASS (content rendered)" : "❌ FAIL (empty)"}`);

  const hasUnmatchedRoute = bodyText.includes("Unmatched Route");
  console.log(`\nUnmatched Route shown: ${hasUnmatchedRoute ? "❌ FAIL" : "✅ PASS"}`);

  // Check for login screen content
  const hasLoginScreen =
    bodyText.includes("Log in") ||
    bodyText.includes("Create") ||
    bodyText.includes("Track meals") ||
    bodyText.includes("Discipline");
  console.log(`Login screen visible: ${hasLoginScreen ? "✅ PASS" : "❌ FAIL"}`);

  console.log(`\nJS errors: ${errors.length}`);
  if (errors.length > 0) {
    errors.slice(0, 5).forEach((e) => console.log(`  ❌ ${e.substring(0, 200)}`));
  } else {
    console.log("  ✅ PASS (no errors)");
  }

  console.log(`\nConsole messages: ${consoleMessages.length}`);
  if (consoleMessages.length > 0) {
    consoleMessages.slice(0, 10).forEach((m) => console.log(`  ${m.substring(0, 200)}`));
  }

  // Screenshot
  await page.screenshot({ path: "web-live-test.png", fullPage: true });
  console.log("\n📸 Screenshot saved: web-live-test.png");

  await browser.close();

  console.log("\n=== Summary ===");
  const allPass = title === "Discipline" && !hasUnmatchedRoute && hasLoginScreen && errors.length === 0;
  console.log(`  Title: ${title === "Discipline" ? "✅" : "❌"}`);
  console.log(`  Content: ${bodyText.length > 0 ? "✅" : "❌"}`);
  console.log(`  No "Unmatched Route": ${!hasUnmatchedRoute ? "✅" : "❌"}`);
  console.log(`  Login screen visible: ${hasLoginScreen ? "✅" : "❌"}`);
  console.log(`  No errors: ${errors.length === 0 ? "✅" : "❌"}`);
  console.log(`  Overall: ${allPass ? "✅ ALL PASS" : "❌ FAILURES"}`);
  console.log("");
}

testLiveUrl().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
