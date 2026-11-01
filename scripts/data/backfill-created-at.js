// 모은 스펙에 캐릭터 생성일(character/basic 의 character_date_create)을 채운다 — 동급 비교의 '생성 연도' 무리.
// 생성일이 없는 캐릭터만 넥슨 basic 을 한 번씩 부른다(캐시 없이, 동시 6). 새로 조회되는 캐릭터는 조회 때 저절로 채워진다.
//
//   node scripts/data/backfill-created-at.js [--dry-run] [--limit 1000] [--workers 6]
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");
const envFile = [path.join(rootDir, ".env"), path.resolve(rootDir, "../../../.env")].find((file) => fs.existsSync(file));
if (envFile) dotenv.config({ path: envFile, quiet: true });

const mongoose = require("mongoose");
const { CharacterSpec } = require("../../src/models/character-spec.model");
const { getCharacterByOcid } = require("../../src/services/maplestorym.service");

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) || fallback : fallback);
const dryRun = args.includes("--dry-run");
const limit = option("--limit", 0);
const workers = Math.max(1, Math.min(10, option("--workers", 6)));

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  const filter = { characterCreatedAt: { $exists: false } };
  const pending = await CharacterSpec.countDocuments(filter);
  console.log(`생성일 없는 캐릭터 ${pending}명${limit ? ` (이번엔 ${limit}명까지)` : ""}${dryRun ? " — dry run, 쓰지 않음" : ""}`);
  if (dryRun || !pending) return;

  const ocids = (await CharacterSpec.find(filter, { _id: 0, ocid: 1 }).limit(limit || 0).lean()).map((row) => row.ocid).filter(Boolean);
  const status = { saved: 0, missing: 0, failed: 0 };
  const started = Date.now();
  let next = 0;
  const worker = async () => {
    while (next < ocids.length) {
      const ocid = ocids[next];
      next += 1;
      try {
        const basic = (await getCharacterByOcid("/maplestorym/v1/character/basic", ocid, { useCache: false }))?.data;
        const created = basic?.character_date_create ? new Date(basic.character_date_create) : null;
        if (created && Number.isFinite(created.getTime())) {
          await CharacterSpec.updateOne({ ocid }, { $set: { characterCreatedAt: created } });
          status.saved += 1;
        } else {
          status.missing += 1;
        }
      } catch (error) {
        status.failed += 1;
        if (status.failed <= 5) console.error(`실패 ${ocid.slice(0, 8)}…: ${error?.message || error}`);
      }
      const done = status.saved + status.missing + status.failed;
      if (done % 2000 === 0) console.log(`${done}/${ocids.length} · ${JSON.stringify(status)} · ${Math.round((Date.now() - started) / 1000)}초`);
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
  console.log(`끝 ${JSON.stringify(status)} · ${Math.round((Date.now() - started) / 1000)}초`);
})()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
