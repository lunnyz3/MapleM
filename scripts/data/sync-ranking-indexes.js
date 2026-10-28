// 아이템·스펙 랭킹 컬렉션의 색인을 모델 정의(src/models/*)와 맞춘다: 없는 색인은 만들고, 모델에 없는
// 옛 색인은 지운다. 색인 정의를 바꾼 뒤 운영 DB에 한 번 돌린다.
//
//   node scripts/data/sync-ranking-indexes.js
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");
const envFile = [path.join(rootDir, ".env"), path.resolve(rootDir, "../../../.env")].find((file) => fs.existsSync(file));
if (envFile) dotenv.config({ path: envFile, quiet: true });

const mongoose = require("mongoose");
const { EquipmentItem } = require("../../src/models/equipment-item.model");
const { CharacterSpec } = require("../../src/models/character-spec.model");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  for (const model of [EquipmentItem, CharacterSpec]) {
    const started = Date.now();
    const dropped = await model.syncIndexes();
    console.log(`${model.collection.collectionName}: dropped ${JSON.stringify(dropped)} (${Math.round((Date.now() - started) / 1000)}s)`);
  }
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
