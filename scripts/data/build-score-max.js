// 템환산 100점 기준표: 수집 장비(equipment_items, 지금 점수 버전)에서 부위마다 항목별(기본·추옵·잠재·에디·소울·문장)
// 최댓값을 모아 "그 부위 최고 장비를 최대로 맞춘 점수"를 만든다. 무기는 무기 종류와 상관없이 하나로 본다.
// 읽기만 한다(전체를 한 번 훑어 몇 분 걸린다). 결과: src/game-data/item-score-max.json
//
//   node scripts/data/build-score-max.js
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");
const envFile = [path.join(rootDir, ".env"), path.resolve(rootDir, "../../../.env")].find((file) => fs.existsSync(file));
if (envFile) dotenv.config({ path: envFile, quiet: true });

const mongoose = require("mongoose");
const { EquipmentItem } = require("../../src/models/equipment-item.model");
const { SCORE_VERSION } = require("../../src/domain/items/score");

const PARTS = ["basic", "additional", "potential", "additionalPotential", "soul", "emblem"];
// 무기가 아닌 부위(그 밖의 slot 값은 무기 종류)
const NON_WEAPON = ["모자", "상의", "하의", "한벌옷", "어깨", "장갑", "신발", "망토", "귀고리", "눈장식", "얼굴장식", "목걸이", "반지", "뱃지", "벨트", "보조무기", "엠블렘", "포켓", "훈장", "칭호", "기계 심장"];
// 한 벌에 들어가는 개수(상의+하의와 한벌옷은 큰 쪽)
const FULL_SET = { 무기: 1, 보조무기: 1, 엠블렘: 1, 모자: 1, 어깨: 1, 장갑: 1, 신발: 1, 망토: 1, 벨트: 1, 반지: 4, 목걸이: 2, 귀고리: 1, 눈장식: 1, 얼굴장식: 1, 뱃지: 1, 포켓: 1, 훈장: 1, 칭호: 1 };
const MIN_ITEMS = 50;

const round1 = (value) => Math.round(value * 10) / 10;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const group = { _id: "$slot", items: { $sum: 1 } };
  PARTS.forEach((part) => (group[part] = { $max: `$parts.${part}` }));
  const rows = await EquipmentItem.aggregate([{ $match: { scoreVersion: SCORE_VERSION } }, { $group: group }]).allowDiskUse(true);
  const slots = {};
  for (const row of rows) {
    const key = NON_WEAPON.includes(row._id) ? row._id : "무기";
    const target = (slots[key] = slots[key] || { items: 0, ...Object.fromEntries(PARTS.map((part) => [part, 0])) });
    target.items += row.items;
    PARTS.forEach((part) => (target[part] = Math.max(target[part], Number(row[part]) || 0)));
  }
  for (const [key, slot] of Object.entries(slots)) {
    if (slot.items < MIN_ITEMS) {
      delete slots[key];
      continue;
    }
    PARTS.forEach((part) => (slot[part] = round1(slot[part])));
    slot.max = round1(PARTS.reduce((sum, part) => sum + slot[part], 0));
    slot.maxWithoutEmblem = round1(slot.max - slot.emblem);
  }
  const sum = (field) => {
    let total = 0;
    for (const [key, count] of Object.entries(FULL_SET)) total += (slots[key]?.[field] || 0) * count;
    const top = (slots["상의"]?.[field] || 0) + (slots["하의"]?.[field] || 0);
    return round1(total + Math.max(top, slots["한벌옷"]?.[field] || 0));
  };
  const out = {
    _meta: {
      description: "템환산 100점 기준: 부위마다 수집 장비의 항목별(기본·추옵·잠재·에디·소울·문장) 최댓값의 합 = 그 부위 최고 장비를 최대로 맞춘 점수. 무기는 종류와 상관없이 하나. fullSet = 한 벌(반지 4·목걸이 2, 상의+하의와 한벌옷 중 큰 쪽) 합.",
      updatedAt: new Date().toISOString().slice(0, 10),
      verification: `수집 장비 ${rows.reduce((total, row) => total + row.items, 0).toLocaleString("ko-KR")}개(점수 버전 ${SCORE_VERSION})에서 scripts/data/build-score-max.js 로 만들었다.`
    },
    scoreVersion: SCORE_VERSION,
    slots,
    fullSet: { max: sum("max"), maxWithoutEmblem: sum("maxWithoutEmblem"), slots: FULL_SET }
  };
  fs.writeFileSync(path.join(rootDir, "src", "game-data", "item-score-max.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out.fullSet), Object.keys(slots).join(","));
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
