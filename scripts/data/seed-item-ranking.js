// 아이템·스펙 랭킹 초기 데이터: 저장된 조회 기록(requestlogs 의 character/all)에서 캐릭터마다
// 가장 최근 기록을 읽어 equipment_items·character_specs 에 넣는다. 넥슨 호출은 하지 않는다.
// 30일 안 기록만 쓴다(그보다 오래된 장비는 어차피 30일 TTL 로 지워진다).
//
//   node scripts/data/seed-item-ranking.js --target staging      # 운영 기록 읽기 → 스테이징 DB 쓰기
//   node scripts/data/seed-item-ranking.js --target production   # 운영 기록 읽기 → 운영 DB 쓰기
//   --dry-run  쓰지 않고 개수만 출력
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

const rootDir = path.resolve(__dirname, "../..");
const envFile = [path.join(rootDir, ".env"), path.resolve(rootDir, "../../../.env")].find((file) => fs.existsSync(file));
const prodUri = envFile ? dotenv.parse(fs.readFileSync(envFile)).MONGODB_URI || "" : "";
const secretsFile = path.join(process.env.MAPLEM_MONGO_HOME || "/home/jhc/maplem-mongo", "secrets.env");
const stagingUri = fs.existsSync(secretsFile) ? dotenv.parse(fs.readFileSync(secretsFile)).STAGING_MONGODB_URI || "" : "";

const args = process.argv.slice(2);
const target = args[args.indexOf("--target") + 1];
const dryRun = args.includes("--dry-run");
if (!["staging", "production"].includes(target)) {
  console.error("--target staging|production 를 지정하세요.");
  process.exit(1);
}
if (!prodUri || (target === "staging" && !/\/maplem_staging\?/.test(stagingUri))) {
  console.error("DB 주소를 찾지 못했습니다.");
  process.exit(1);
}

const { recordCharacterItems } = require("../../src/services/item-ranking.service");
const { buildCharacterStats } = require("../../src/domain/stats");
const { readStatValue } = require("../../src/controllers/maplestorym.controller");

(async () => {
  const source = await mongoose.createConnection(prodUri).asPromise();
  await mongoose.connect(target === "staging" ? stagingUri : prodUri);
  const logs = source.collection("requestlogs");
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const filter = { endpoint: /\/character\/all$/, success: true, createdAt: { $gte: since }, "responseBody.details.itemEquipment.data": { $exists: true } };
  const ocids = (await logs.distinct("ocid", filter)).filter(Boolean);
  console.log(`characters: ${ocids.length}${dryRun ? " (dry run)" : ""}`);

  let saved = 0;
  let failed = 0;
  for (const ocid of ocids) {
    const doc = await logs.findOne({ ...filter, ocid }, { sort: { createdAt: -1 } });
    const details = doc?.responseBody?.details;
    const basic = details?.basic?.data || {};
    if (dryRun) continue;
    try {
      let maxDamage = null;
      try {
        maxDamage = buildCharacterStats(details).majorStats?.maxDamage?.value ?? null;
      } catch {
        maxDamage = null;
      }
      const result = await recordCharacterItems({
        ocid,
        characterName: basic.character_name || doc.characterName,
        worldName: doc.worldName,
        characterClass: basic.character_class,
        characterLevel: basic.character_level,
        itemData: details.itemEquipment.data,
        combatPower: readStatValue(details?.stat?.data, "전투력"),
        maxDamage,
        source: "lookup",
        // Keep the lookup time so 30-day expiry follows the real data age.
        now: doc.createdAt
      });
      if (result) saved += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      if (failed <= 5) console.error(ocid.slice(0, 8), error.message);
    }
  }
  console.log(`saved ${saved}, failed ${failed}`);
  await source.close();
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
