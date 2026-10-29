// 템환산 100점 기준표: 수집 장비(equipment_items, 지금 점수 버전)에서 부위마다 실제로 있는 가장 높은 장비 점수,
// 캐릭터 합계는 저장된 캐릭터 중 가장 높은 합계(character_specs). 무기는 무기 종류와 상관없이 하나로 본다.
// 항목별(기본·추옵·잠재·에디·소울·문장) 최댓값도 참고로 남긴다.
// 읽기만 한다(장비 전체를 한 번 훑어 몇 분 걸린다). 결과: src/game-data/item-score-max.json
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
const { CharacterSpec } = require("../../src/models/character-spec.model");
const { SCORE_VERSION } = require("../../src/domain/items/score");

const PARTS = ["basic", "additional", "potential", "additionalPotential", "soul", "emblem"];
// 무기가 아닌 부위(그 밖의 slot 값은 무기 종류)
const NON_WEAPON = ["모자", "상의", "하의", "한벌옷", "어깨", "장갑", "신발", "망토", "귀고리", "눈장식", "얼굴장식", "목걸이", "반지", "뱃지", "벨트", "보조무기", "엠블렘", "포켓", "훈장", "칭호", "기계 심장"];
const MIN_ITEMS = 50;

const round1 = (value) => Math.round(value * 10) / 10;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const group = { _id: "$slot", items: { $sum: 1 }, best: { $max: "$score" }, bestWithoutEmblem: { $max: "$scoreWithoutEmblem" } };
  PARTS.forEach((part) => (group[part] = { $max: `$parts.${part}` }));
  const rows = await EquipmentItem.aggregate([{ $match: { scoreVersion: SCORE_VERSION } }, { $group: group }]).allowDiskUse(true);
  const slots = {};
  for (const row of rows) {
    const key = NON_WEAPON.includes(row._id) ? row._id : "무기";
    const target = (slots[key] = slots[key] || { items: 0, best: 0, bestWithoutEmblem: 0, ...Object.fromEntries(PARTS.map((part) => [part, 0])) });
    target.items += row.items;
    target.best = Math.max(target.best, Number(row.best) || 0);
    target.bestWithoutEmblem = Math.max(target.bestWithoutEmblem, Number(row.bestWithoutEmblem) || 0);
    PARTS.forEach((part) => (target[part] = Math.max(target[part], Number(row[part]) || 0)));
  }
  for (const [key, slot] of Object.entries(slots)) {
    if (slot.items < MIN_ITEMS) {
      delete slots[key];
      continue;
    }
    PARTS.forEach((part) => (slot[part] = round1(slot[part])));
    // 100점 = 실제로 있는 가장 높은 장비(항목별 최댓값의 합은 한 장비가 다 가질 수 없어 너무 높다).
    slot.max = round1(slot.best);
    slot.maxWithoutEmblem = round1(slot.bestWithoutEmblem);
    delete slot.best;
    delete slot.bestWithoutEmblem;
  }
  // 캐릭터 합계 100점 = 저장된 캐릭터 중 가장 높은 템환산 합계
  const bestSpec = async (field) =>
    Number((await CharacterSpec.findOne({ scoreVersion: SCORE_VERSION }).sort({ [field]: -1 }).select({ [field]: 1, _id: 0 }).lean())?.[field]) || 0;
  const [specMax, specMaxWithoutEmblem] = await Promise.all([bestSpec("itemScore"), bestSpec("itemScoreWithoutEmblem")]);
  const out = {
    _meta: {
      description: "템환산 100점 기준: 장비는 부위마다 DB에 있는 가장 높은 장비 점수(max·maxWithoutEmblem), 캐릭터 합계는 DB에서 가장 높은 캐릭터 합계(fullSet). 무기는 종류와 상관없이 하나. basic~emblem 은 항목별 최댓값(참고).",
      updatedAt: new Date().toISOString().slice(0, 10),
      verification: `수집 장비 ${rows.reduce((total, row) => total + row.items, 0).toLocaleString("ko-KR")}개(점수 버전 ${SCORE_VERSION})에서 scripts/data/build-score-max.js 로 만들었다.`
    },
    scoreVersion: SCORE_VERSION,
    slots,
    fullSet: { max: round1(specMax), maxWithoutEmblem: round1(specMaxWithoutEmblem) }
  };
  fs.writeFileSync(path.join(rootDir, "src", "game-data", "item-score-max.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out.fullSet), Object.keys(slots).join(","));
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
