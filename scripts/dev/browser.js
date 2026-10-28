// Playwright Chromium 실행 도우미.
// 시스템에 없는 X11 라이브러리를 scripts/dev/setup-browser.sh 가 .cache/browser-libs 에 풀어두므로
// 브라우저 프로세스에 LD_LIBRARY_PATH 를 넘겨서 실행한다. (sudo 로 시스템에 설치돼 있으면 그대로 동작)
const path = require("path");
const { chromium } = require("playwright");

const extraLibDir = path.resolve(__dirname, "../../.cache/browser-libs/root/usr/lib/x86_64-linux-gnu");

function launchBrowser(options = {}) {
  const ldPath = [extraLibDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
  return chromium.launch({
    ...options,
    env: { ...process.env, LD_LIBRARY_PATH: ldPath, ...(options.env || {}) }
  });
}

module.exports = { launchBrowser };
