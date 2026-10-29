// 점수 규칙(item-score.json version)을 바꾼 뒤 저장된 장비(equipment_items)의 템환산·항목별 점수를 저장된
// 넥슨 응답(item)으로 다시 계산한다. 넥슨 호출은 없다. 캐릭터 합계(character_specs)는 프리셋 구성이 저장돼
// 있지 않아 다시 모아야 한다(collect-items-now.js --force, sweep-characters.js).
//
//   node scripts/data/rescore-items.js            # 바꿀 건수만 센다
//   node scripts/data/rescore-items.js --write    # 실제로 고친다
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");
const envFile = [path.join(rootDir, ".env"), path.resolve(rootDir, "../../../.env")].find((file) => fs.existsSync(file));
if (envFile) dotenv.config({ path: envFile, quiet: true });

const mongoose = require("mongoose");
const { EquipmentItem } = require("../../src/models/equipment-item.model");
const { scoreItem, SCORE_VERSION } = require("../../src/domain/items/score");

const BATCH = 1000;

(async () => {
  const write = process.argv.includes("--write");
  await mongoose.connect(process.env.MONGODB_URI);
  const filter = { scoreVersion: { $ne: SCORE_VERSION } };
  const total = await EquipmentItem.countDocuments(filter);
  console.log(`version ${SCORE_VERSION}: ${total.toLocaleString("ko-KR")}건 ${write ? "다시 계산" : "(--write 없이 세기만)"}`);
  if (!write) return mongoose.disconnect();

  const cursor = EquipmentItem.find(filter).select({ _id: 1, item: 1 }).lean().cursor({ batchSize: BATCH });
  let ops = [];
  let done = 0;
  const flush = async () => {
    if (!ops.length) return;
    await EquipmentItem.bulkWrite(ops, { ordered: false });
    done += ops.length;
    ops = [];
    if (done % (BATCH * 50) === 0 || done === total) console.log(`${done.toLocaleString("ko-KR")}/${total.toLocaleString("ko-KR")}`);
  };
  for await (const doc of cursor) {
    const { score, scoreWithoutEmblem, parts } = scoreItem(doc.item);
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { score, scoreWithoutEmblem, parts, scoreVersion: SCORE_VERSION } } } });
    if (ops.length >= BATCH) await flush();
  }
  await flush();
  console.log(`끝: ${done.toLocaleString("ko-KR")}건`);
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
