"use strict";

// 미니게임에 쓸 캐릭터와 장비창(순수 함수). 저장된 전투력은 조회할 때 끼고 있던 장비로 잰 값이라, 사냥 프리셋을
// 끼고 있었으면 장비에 비해 한참 낮다. 템환산·레벨이 비슷한 캐릭터들의 전투력 중앙값을 예상 전투력으로 보고,
// 실제 전투력이 그 근처(FAIR_BAND)인 캐릭터만 쓴다.
const { mainSetup } = require("./job-meta");

const SCORE_STEP = Math.log(1.06);
const LEVEL_STEP = 4;
const MIN_PEERS = 15;
const FAIR_BAND = Object.freeze([0.8, 1.3]);

/** 템환산 6%·레벨 4 폭의 묶음 이름(템환산이나 레벨을 모르면 ""). */
function peerKey(row) {
  const score = Number(row?.itemScore) || 0;
  const level = Number(row?.characterLevel) || 0;
  return score > 0 && level > 0 ? `${Math.round(Math.log(score) / SCORE_STEP)}|${Math.round(level / LEVEL_STEP)}` : "";
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 묶음별 전투력 중앙값(MIN_PEERS 명 이상인 묶음만). */
function peerMedians(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = peerKey(row);
    const power = Number(row?.combatPower) || 0;
    if (!key || power <= 0) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(power);
  }
  const medians = new Map();
  for (const [key, powers] of groups) if (powers.length >= MIN_PEERS) medians.set(key, median(powers));
  return medians;
}

/** 실제 ÷ 예상 전투력(비슷한 캐릭터가 모자라면 null). */
function fairRatio(row, medians) {
  const key = peerKey(row);
  const expected = key ? medians.get(key) : null;
  const power = Number(row?.combatPower) || 0;
  return expected && power > 0 ? power / expected : null;
}

/** 전투력이 minPower 이상이고 예상 전투력 근처인 캐릭터. */
function fairCharacters(rows, medians, minPower) {
  return rows.filter((row) => {
    if (!(Number(row?.combatPower) >= minPower)) return false;
    const ratio = fairRatio(row, medians);
    return ratio !== null && ratio >= FAIR_BAND[0] && ratio <= FAIR_BAND[1];
  });
}

/** 무작위로 size 개(앞에서부터 섞는 Fisher–Yates). */
function sampleOf(list, size, random = Math.random) {
  const copy = [...list];
  const count = Math.min(size, copy.length);
  for (let i = 0; i < count; i += 1) {
    const j = i + Math.floor(random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

// 장비창 순서. 한벌옷과 상의·하의는 템환산이 높은 쪽만 남긴다.
const GEAR_ORDER = Object.freeze([
  "무기",
  "보조무기",
  "엠블렘",
  "모자",
  "한벌옷",
  "상의",
  "하의",
  "어깨",
  "장갑",
  "신발",
  "망토",
  "벨트",
  "목걸이",
  "목걸이 (2번째 슬롯)",
  "귀고리",
  "눈장식",
  "얼굴장식",
  "포켓",
  "뱃지",
  "반지",
  "반지 (2번째 슬롯)",
  "반지 (3번째 슬롯)",
  "반지 (4번째 슬롯)",
  "훈장",
  "칭호"
]);

const hasLines = (list) => Array.isArray(list) && list.length > 0;

/** 한 캐릭터의 장비 → 장비창 칸 [{ slot, name, icon, star, grade, potential, additional }] (등급은 옵션이 있을 때만). */
function gearWindow(docs) {
  const setup = mainSetup(docs);
  const overall = setup.get("한벌옷");
  if (overall && (setup.has("상의") || setup.has("하의"))) {
    const pair = (setup.get("상의")?.score || 0) + (setup.get("하의")?.score || 0);
    if ((overall.score || 0) >= pair) {
      setup.delete("상의");
      setup.delete("하의");
    } else setup.delete("한벌옷");
  }
  return GEAR_ORDER.filter((slot) => setup.has(slot)).map((slot) => {
    const item = setup.get(slot).item || {};
    return {
      slot,
      name: String(item.item_name || ""),
      icon: String(item.item_icon || ""),
      star: Number(item.starforce_upgrade) || 0,
      grade: String(item.item_grade || ""),
      potential: hasLines(item.item_potential_option) ? String(item.item_potential_option_grade || "") : "",
      additional: hasLines(item.item_additional_potential_option) ? String(item.item_additional_potential_option_grade || "") : ""
    };
  });
}

module.exports = { peerKey, peerMedians, fairRatio, fairCharacters, sampleOf, gearWindow, GEAR_ORDER, FAIR_BAND };
