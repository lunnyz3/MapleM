// Headless Chromium 동작 확인용: node scripts/dev/browser-smoke.js [url]
const { launchBrowser } = require("./browser");

async function main() {
  const url = process.argv[2] || "https://maplemworlds.kr/";
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    console.log("title:", await page.title());
    const text = (await page.innerText("body")).replace(/\s+/g, " ").slice(0, 300);
    console.log("body:", text);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[browser-smoke 실패]", error.message);
  process.exitCode = 1;
});
