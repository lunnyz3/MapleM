// 매일 장비 수집(전투력 랭킹 1만 명)을 지금 한 번 돌린다. 점수 규칙(item-score.json version)을 바꾼 뒤
// 오늘 이미 모은 캐릭터까지 다시 모을 때 쓴다(--force). 넥슨 호출 약 2만 건, 20분 남짓.
//
//   node scripts/data/collect-items-now.js --force
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");
const envFile = [path.join(rootDir, ".env"), path.resolve(rootDir, "../../../.env")].find((file) => fs.existsSync(file));
if (envFile) dotenv.config({ path: envFile, quiet: true });

const mongoose = require("mongoose");
const { itemCollector } = require("../../src/jobs/item-collection.job");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const timer = setInterval(() => {
    const status = itemCollector.getStatus();
    console.log(`${status.state} ${status.saved + status.skipped + status.failed}/${status.total} (saved ${status.saved}, failed ${status.failed})`);
  }, 60 * 1000);
  const status = await itemCollector.runOnce({ force: process.argv.includes("--force") });
  clearInterval(timer);
  console.log(JSON.stringify(status));
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
