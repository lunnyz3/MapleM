"use strict";

// 캐릭터 카드(순수 함수): 같은 직업으로 모은 캐릭터 안에서 여섯 능력치의 백분위를 40~99점으로 바꾸고,
// 전투력을 무겁게 섞은 종합 점수(OVR)와 카드 등급을 낸다. 추옵·스타포스는 칸마다 점수가 가장 높은 장비(메인 세팅)로 잰다.
const { mainSetup, flameScore } = require("./job-meta");
const scoreMax = require("../../game-data/item-score-max.json");

const STATS = Object.freeze([
  { key: "power", label: "전투", name: "전투력", weight: 0.4 },
  { key: "itemScore", label: "템환", name: "템환산", weight: 0.2 },
  { key: "potential", label: "잠재", name: "잠재", weight: 0.1 },
  { key: "additional", label: "에디", name: "에디", weight: 0.1 },
  { key: "flame", label: "추옵", name: "추옵", weight: 0.1 },
  { key: "starforce", label: "스포", name: "스타포스", weight: 0.1 }
]);

const TIERS = Object.freeze([
  { min: 90, key: "legendary", label: "레전더리" },
  { min: 80, key: "unique", label: "유니크" },
  { min: 70, key: "epic", label: "에픽" },
  { min: 0, key: "rare", label: "레어" }
]);

// "반지 (2번째 슬롯)" → "반지"
const slotGroup = (slot) => String(slot || "").replace(/\s*\(.*\)\s*$/, "");

/** 메인 세팅의 추옵 평균(추옵이 붙는 칸, 그 칸 최고 추옵 = 100)과 스타포스 합. */
function gearMetrics(docs) {
  let flameSum = 0;
  let flameCount = 0;
  let starforce = 0;
  for (const [slot, doc] of mainSetup(docs)) {
    const group = slotGroup(slot);
    if (Number(scoreMax.slots?.[group]?.additional) > 0) {
      flameSum += flameScore(doc, group);
      flameCount += 1;
    }
    starforce += Number(doc.starforce ?? doc.item?.starforce_upgrade) || 0;
  }
  return { flame: flameCount ? Math.round((flameSum / flameCount) * 10) / 10 : 0, starforce };
}

const ascending = (values) => values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);

/** 직업 분포: 능력치마다 정렬된 값. specs 는 그 직업 전원, docs 는 무작위로 고른 캐릭터들의 장비. */
function cardScale(specs, docs) {
  const byOcid = new Map();
  for (const doc of docs) {
    if (!byOcid.has(doc.ocid)) byOcid.set(doc.ocid, []);
    byOcid.get(doc.ocid).push(doc);
  }
  const gear = [...byOcid.values()].map(gearMetrics);
  return {
    count: specs.length,
    power: ascending(specs.map((spec) => Number(spec.combatPower))),
    itemScore: ascending(specs.map((spec) => Number(spec.itemScore))),
    potential: ascending(specs.map((spec) => Number(spec.potential))),
    additional: ascending(specs.map((spec) => Number(spec.additionalPotential))),
    flame: ascending(gear.map((entry) => entry.flame)),
    starforce: ascending(gear.map((entry) => entry.starforce))
  };
}

/** 정렬된 값에서 value 의 백분위 0~1(같은 값은 가운데). */
function percentile(sorted, value) {
  if (!sorted.length || !Number.isFinite(value)) return 0;
  let below = 0;
  let same = 0;
  for (const entry of sorted) {
    if (entry < value) below += 1;
    else if (entry === value) same += 1;
    else break;
  }
  return (below + same / 2) / sorted.length;
}

/** 백분위 → 40~99: 가운데가 61, 위 10%가 90, 위 1%가 98 안팎. */
function rating(p) {
  return Math.max(40, Math.min(99, Math.round(40 + 59 * Math.max(0, Math.min(1, p)) ** 1.5)));
}

const tierOf = (ovr) => TIERS.find((tier) => ovr >= tier.min);

/**
 * @param {{ characterClass: string, combatPower?: number, itemScore?: number, potential?: number, additionalPotential?: number }} spec
 * @param {any[]} docs 이 캐릭터의 장비
 * @param {ReturnType<typeof cardScale>} scale
 * @param {{ power?: number }} [options] power: 화면에 보이는 전투력(사냥 프리셋으로 잰 저장값 대신)
 */
function buildCard(spec, docs, scale, { power } = {}) {
  const gear = gearMetrics(docs);
  const values = {
    power: Number(power) > 0 ? Number(power) : Number(spec.combatPower) || 0,
    itemScore: Number(spec.itemScore) || 0,
    potential: Number(spec.potential) || 0,
    additional: Number(spec.additionalPotential) || 0,
    flame: gear.flame,
    starforce: gear.starforce
  };
  const stats = STATS.map((stat) => {
    const p = percentile(scale[stat.key], values[stat.key]);
    return { key: stat.key, label: stat.label, name: stat.name, value: values[stat.key], top: Math.max(0.1, Math.round((1 - p) * 1000) / 10), rating: rating(p) };
  });
  const ovr = Math.round(stats.reduce((sum, stat, index) => sum + stat.rating * STATS[index].weight, 0));
  const tier = tierOf(ovr);
  return { className: spec.characterClass, count: scale.count, ovr, tier: tier.key, tierLabel: tier.label, stats };
}

module.exports = { gearMetrics, cardScale, percentile, rating, buildCard, STATS, TIERS };
