// 로컬 개발 서버 실행기.
// 운영 .env 에서 넥슨 API 관련 값만 읽어오고, 챗봇은 끈 상태로 server.js 를 띄운다.
// 운영 DB(maplem)에는 절대 연결하지 않는다: 기본은 MongoDB 끔, --staging 이면 스테이징 DB(maplem_staging).
//
//   node scripts/dev/run-local.js              # http://localhost:3200, MongoDB 없음
//   node scripts/dev/run-local.js --staging    # http://localhost:3300, maplem_staging DB
//   PORT=3400 MAPLEM_ENV_FILE=/path/.env node scripts/dev/run-local.js
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");
const candidates = [
  process.env.MAPLEM_ENV_FILE,
  path.join(rootDir, ".env"),
  // git worktree(.claude/worktrees/<name>)에서 실행하면 원본 체크아웃의 .env 를 쓴다.
  path.resolve(rootDir, "../../../.env")
].filter(Boolean);
const envFile = candidates.find((file) => fs.existsSync(file));
const fileEnv = envFile ? dotenv.parse(fs.readFileSync(envFile)) : {};

const passThroughKeys = ["NEXON_OPEN_API_KEY", "NEXON_API_BASE_URL"];
for (const key of passThroughKeys) {
  if (!process.env[key] && fileEnv[key]) {
    process.env[key] = fileEnv[key];
  }
}

const staging = process.argv.includes("--staging");
let mongoUri = "";
if (staging) {
  const secretsFile = path.join(process.env.MAPLEM_MONGO_HOME || "/home/jhc/maplem-mongo", "secrets.env");
  mongoUri = fs.existsSync(secretsFile) ? dotenv.parse(fs.readFileSync(secretsFile)).STAGING_MONGODB_URI || "" : "";
  if (!/\/maplem_staging\?/.test(mongoUri)) {
    console.error("[run-local] 스테이징 DB(maplem_staging) URI를 찾지 못했습니다.");
    process.exit(1);
  }
}

process.env.PORT = process.env.PORT || (staging ? "3300" : "3200");
// 하루 한 번 랭킹 1만 명 장비 수집(넥슨 호출 약 2만 건)은 운영 서버에서만 돈다.
process.env.ITEM_COLLECTION_ENABLED = process.env.ITEM_COLLECTION_ENABLED || "false";
process.env.POWER_PATROL_ENABLED = process.env.POWER_PATROL_ENABLED || "false";
process.env.MONGODB_URI = mongoUri;
process.env.CHATBOT_ENABLED = "false";
process.env.NEXON_STATS_LOG_INTERVAL_MS = process.env.NEXON_STATS_LOG_INTERVAL_MS || "5000";

console.log(
  `[run-local] env=${envFile || "(none)"} nexonKey=${process.env.NEXON_OPEN_API_KEY ? "set" : "missing"} mongo=${staging ? "maplem_staging" : "off"} port=${process.env.PORT}`
);
process.chdir(rootDir);
require(path.join(rootDir, "server.js"));
