// 장비 운빨 지수 분포표: 저장된 캐릭터를 무작위로 골라 메인 세팅(칸마다 점수가 가장 높은 장비)의 잠재·에디·추옵
// 상위 %를 공식 확률표(public/js/features/item-share.js)로 계산하고, 점수(web/src/lib/luck.mjs)의 분위표를 만든다.
// 전체 분위표와, 전투력이 비슷한 캐릭터끼리(전투력 10분위 구간) 분위표. 확률표가 있는 칸이 6개 미만인 캐릭터는 뺀다.
// 읽기만 한다(1만 명에 약 3분). 결과: src/game-data/luck.json
//
//   node scripts/data/build-luck.js [표본 수, 기본 12000]
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");
const envFile = [path.join(rootDir, ".env"), path.resolve(rootDir, "../../../.env")].find((file) => fs.existsSync(file));
if (envFile) dotenv.config({ path: envFile, quiet: true });

const mongoose = require("mongoose");
const { EquipmentItem } = require("../../src/models/equipment-item.model");
const { CharacterSpec } = require("../../src/models/character-spec.model");
const { SCORE_VERSION } = require("../../src/domain/items/score");
const { mainSetup } = require("../../src/domain/stats/job-meta");
const { mapEquipmentItemForView } = require("../../src/controllers/maplestorym.controller");

const SAMPLE = Number(process.argv[2]) || 12000;
const MIN_SECTIONS = 6;
const BANDS = 10;
const PROBABILITY_DIR = path.join(rootDir, "public", "probability");

/** 브라우저용 확률 모듈을 노드에서: 표는 public/probability 에서 읽는다(test/probability.test.js 와 같은 방식). */
async function loadItemShare() {
  globalThis.document = globalThis.document || { body: { dataset: {} }, querySelector: () => null };
  globalThis.fetch = async (url) => {
    const file = path.join(PROBABILITY_DIR, decodeURIComponent(String(url).replace(/^\/probability\//, "")));
    const ok = path.dirname(file) === PROBABILITY_DIR && fs.existsSync(file);
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  };
  return import(pathToFileURL(path.join(rootDir, "public", "js", "features", "item-share.js")).href);
}

/** 두 자리 유효숫자로 내림(구간 경계를 읽기 좋게). */
function roundDown(value) {
  if (!(value > 0)) return 0;
  const scale = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.floor(value / scale) * scale;
}

(async () => {
  const share = await loadItemShare();
  const { itemLuck, quantilesOf } = await import(pathToFileURL(path.join(rootDir, "web", "src", "lib", "luck.mjs")).href);
  await mongoose.connect(process.env.MONGODB_URI);
  const specs = await CharacterSpec.aggregate([{ $match: { scoreVersion: SCORE_VERSION, combatPower: { $gt: 0 } } }, { $sample: { size: SAMPLE } }]);
  const rows = [];
  for (const spec of specs) {
    const docs = await EquipmentItem.find({ ocid: spec.ocid, scoreVersion: SCORE_VERSION }, { slot: 1, itemName: 1, score: 1, starforce: 1, item: 1 }).lean();
    let points = 0;
    let sections = 0;
    for (const doc of mainSetup(docs).values()) {
      const breakdown = await share.resolveTopPercentBreakdown(mapEquipmentItemForView(doc.item), {
        attackType: spec.attackType,
        className: spec.characterClass
      });
      if (!breakdown) continue;
      const luck = itemLuck({
        potential: breakdown.potentialProbability,
        additional: breakdown.additionalProbability,
        flame: breakdown.additionalOptionProbability
      });
      points += luck.points;
      sections += luck.sections;
    }
    if (sections >= MIN_SECTIONS) rows.push({ power: spec.combatPower, points });
  }
  rows.sort((a, b) => a.power - b.power);
  // 전투력 10분위로 구간을 나눈다(경계는 두 자리 유효숫자).
  const edges = Array.from({ length: BANDS - 1 }, (_, index) => roundDown(rows[Math.floor(((index + 1) / BANDS) * rows.length)].power));
  const bands = [0, ...edges].map((min, index) => {
    const max = index < edges.length ? edges[index] : null;
    const inBand = rows.filter((row) => row.power >= min && (max === null || row.power < max));
    return { min, max, n: inBand.length, quantiles: quantilesOf(inBand.map((row) => row.points)) };
  });
  const data = {
    _meta: {
      description: "장비 운빨 지수 분위표. 점수 = 메인 세팅 장비의 잠재·에디·추옵 상위 확률 p마다 −log10(p)의 합. quantiles[i] = 하위 i% 지점의 점수.",
      updatedAt: new Date().toISOString().slice(0, 10),
      verification: `저장된 캐릭터 ${specs.length.toLocaleString("ko-KR")}명을 무작위로 골라 확률표가 있는 칸이 ${MIN_SECTIONS}개 이상인 ${rows.length.toLocaleString("ko-KR")}명으로 scripts/data/build-luck.js 가 만들었다.`
    },
    sample: rows.length,
    overall: quantilesOf(rows.map((row) => row.points)),
    bands
  };
  fs.writeFileSync(path.join(rootDir, "src", "game-data", "luck.json"), JSON.stringify(data) + "\n");
  console.log(`sampled ${specs.length}, used ${rows.length}, bands ${bands.map((band) => `${band.min}:${band.n}`).join(" ")}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
