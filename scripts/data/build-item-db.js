// 아이템 DB: 수집 장비(제네시스·아케인셰이드)에서 아이템마다 스타포스 단계별 기본 옵션 값을 만든다.
// 기본 옵션 값에서 같은 스탯의 추가 옵션을 빼고(기본 옵션에 추옵이 들어 있다), 기본 옵션 마스터리를 쓰지 않은
// 장비(mastery_info.base_option_point = 0)만 센다. 단계마다 가장 많이 나온 값(최빈값)을 쓴다.
// 읽기만 한다. 결과: src/game-data/item-db.json
//
//   node scripts/data/build-item-db.js
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");
const envFile = [path.join(rootDir, ".env"), path.resolve(rootDir, "../../../.env")].find((file) => fs.existsSync(file));
if (envFile) dotenv.config({ path: envFile, quiet: true });

const mongoose = require("mongoose");
const { EquipmentItem } = require("../../src/models/equipment-item.model");
const { SCORE_VERSION } = require("../../src/domain/items/score");

const FAMILIES = ["아케인셰이드", "제네시스"];
const MIN_SAMPLES = 3;

const numberOf = (text) => Number(String(text ?? "").replace(/[^0-9.\-]/g, ""));

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const cursor = EquipmentItem.find({ scoreVersion: SCORE_VERSION, family: { $in: FAMILIES } })
    .select({ _id: 0, itemName: 1, slot: 1, family: 1, starforce: 1, "item.item_basic_option": 1, "item.item_additional_option": 1, "item.mastery_info": 1 })
    .lean()
    .cursor({ batchSize: 2000 });
  /** @type {Map<string, { slot: string, family: string, stars: Map<number, Map<string, Map<number, number>>> }>} */
  const items = new Map();
  let seen = 0;
  let used = 0;
  for await (const doc of cursor) {
    seen += 1;
    const mastery = doc.item?.mastery_info;
    if (!mastery || Number(mastery.base_option_point) !== 0) continue;
    used += 1;
    const additional = new Map();
    for (const option of doc.item?.item_additional_option || []) {
      const value = numberOf(option.option_value);
      if (Number.isFinite(value)) additional.set(option.option_name, (additional.get(option.option_name) || 0) + value);
    }
    const entry = items.get(doc.itemName) || { slot: doc.slot, family: doc.family, stars: new Map() };
    items.set(doc.itemName, entry);
    const star = Number(doc.starforce) || 0;
    const options = entry.stars.get(star) || new Map();
    entry.stars.set(star, options);
    for (const option of doc.item?.item_basic_option || []) {
      const value = numberOf(option.option_value) - (additional.get(option.option_name) || 0);
      if (!Number.isFinite(value) || value <= 0) continue;
      const counts = options.get(option.option_name) || new Map();
      options.set(option.option_name, counts);
      const key = Math.round(value * 100) / 100;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const out = {};
  for (const [name, entry] of [...items.entries()].sort(([a], [b]) => a.localeCompare(b, "ko"))) {
    const stars = {};
    for (const [star, options] of [...entry.stars.entries()].sort((a, b) => a[0] - b[0])) {
      const row = {};
      let samples = 0;
      for (const [option, counts] of options) {
        const [value, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
        row[option] = value;
        samples = Math.max(samples, count);
      }
      if (samples >= MIN_SAMPLES) stars[star] = row;
    }
    if (Object.keys(stars).length) out[name] = { slot: entry.slot, family: entry.family, stars };
  }
  const data = {
    _meta: {
      description: "아이템 DB: 아이템마다 스타포스 단계별 기본 옵션(추가 옵션을 뺀 값). 기본 옵션 마스터리 0인 수집 장비의 최빈값, 단계마다 같은 값이 3개 이상일 때만.",
      updatedAt: new Date().toISOString().slice(0, 10),
      verification: `수집 장비 ${seen.toLocaleString("ko-KR")}개 중 ${used.toLocaleString("ko-KR")}개(제네시스·아케인셰이드, 기본 옵션 마스터리 0)로 scripts/data/build-item-db.js 가 만들었다.`
    },
    items: out
  };
  fs.writeFileSync(path.join(rootDir, "src", "game-data", "item-db.json"), JSON.stringify(data) + "\n");
  console.log(`items ${Object.keys(out).length}, seen ${seen}, used ${used}`);
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
