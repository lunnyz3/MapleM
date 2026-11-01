"use strict";

// 잠재 수준(장비 갈아타기 손익분기): 같은 계열·부위·공격 타입으로 모은 장비를 잠재+에디 점수(parts.potential +
// parts.additionalPotential, 템환산 점수 단위)로 줄 세워 하위 25%·중앙값·상위 25% 자리의 장비를 고른다. 점수만으로는
// 캐릭터마다 전투력이 얼마나 오르는지 모르므로, 고른 장비의 실제 잠재·에디 줄을 그 수준의 대표 옵션으로 쓴다.
// 방어구는 부위마다 굴릴 수 있는 옵션이 달라(모자·망토 윗잠은 HP뿐, 에디에 보공·대미지) 잠재와 에디를 함께 센다.

const FAMILIES = Object.freeze(["아케인셰이드", "제네시스"]);
const LEVELS = Object.freeze([
  { key: "q25", label: "하위 25%", p: 0.25 },
  { key: "q50", label: "중간", p: 0.5 },
  { key: "q75", label: "상위 25%", p: 0.75 }
]);
const ARMOR_SLOTS = new Set(["모자", "상의", "하의", "한벌옷", "어깨", "장갑", "신발", "망토"]);
// 무기 종류별 표본이 모자라면 같은 계열·공격 타입 무기를 모두 묶어 본다.
const ALL_WEAPONS = "무기";
const MIN_SAMPLE = 30;

function groupKey(family, slot, attackType) {
  return `${family}|${slot}|${attackType === "magical" ? "magical" : "physical"}`;
}

/** 장비 한 개가 들어가는 묶음: 계열·부위·공격 타입, 무기는 계열 전체 무기 묶음에도. */
function groupKeysOf(row) {
  const keys = [groupKey(row.family, row.slot, row.attackType)];
  if (!ARMOR_SLOTS.has(row.slot)) keys.push(groupKey(row.family, ALL_WEAPONS, row.attackType));
  return keys;
}

/** 점수 오름차순 목록에서 p 자리(가장 가까운 순위)의 항목. 고른 장비의 점수가 곧 그 분위 값이다. */
function atRank(sorted, p) {
  return sorted[Math.round((sorted.length - 1) * p)];
}

/**
 * 장비를 하나씩 넣고(읽으면서 바로 넣어 원본 행을 들고 있지 않는다) 묶음마다 분위 자리의 장비를 고른다.
 * 잠재·에디에 전투 옵션이 하나도 없는 장비(점수 0: 사냥용 드롭·메소 잠재 등)는 세지 않는다. 그 수준은 '잠재 없음'이 맡는다.
 */
function createLevelPicker() {
  /** @type {Map<string, Array<{ score: number, id: any }>>} */
  const groups = new Map();
  return {
    /** @param {{ id: any, family: string, slot: string, attackType: string, score: number }} row */
    add(row) {
      const score = Number(row.score) || 0;
      if (!(score > 0) || !FAMILIES.includes(row.family) || !row.slot) return;
      const entry = { score, id: row.id };
      for (const key of groupKeysOf(row)) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
      }
    },
    /**
     * @param {number} [minSample] 이보다 적은 묶음은 뺀다
     * @returns {Map<string, { sample: number, picks: Array<{ key: string, label: string, score: number, id: any }> }>}
     */
    pick(minSample = MIN_SAMPLE) {
      const out = new Map();
      for (const [key, list] of groups) {
        if (list.length < minSample) continue;
        list.sort((a, b) => a.score - b.score);
        out.set(key, {
          sample: list.length,
          picks: LEVELS.map((level) => {
            const pick = atRank(list, level.p);
            return { key: level.key, label: level.label, score: Math.round(pick.score * 10) / 10, id: pick.id };
          })
        });
      }
      return out;
    }
  };
}

/**
 * 모은 장비의 잠재+에디 점수 → 묶음마다 분위 자리의 장비(createLevelPicker 를 한 번에).
 * @param {Iterable<{ id: any, family: string, slot: string, attackType: string, score: number }>} rows @param {number} [minSample]
 */
function pickLevels(rows, minSample = MIN_SAMPLE) {
  const picker = createLevelPicker();
  for (const row of rows) picker.add(row);
  return picker.pick(minSample);
}

/** 넥슨 옵션 목록 → [{ name, value }] */
function optionLines(list) {
  return (Array.isArray(list) ? list : [])
    .map((option) => ({ name: String(option?.option_name ?? "").trim(), value: String(option?.option_value ?? "").trim() }))
    .filter((line) => line.name);
}

/** 대표 장비(넥슨 원본)의 잠재·에디 줄과 등급. */
function levelLines(item) {
  return {
    potential: optionLines(item?.item_potential_option),
    additionalPotential: optionLines(item?.item_additional_potential_option),
    potentialGrade: String(item?.item_potential_option_grade ?? "").trim(),
    additionalPotentialGrade: String(item?.item_additional_potential_option_grade ?? "").trim()
  };
}

/**
 * 장비 한 칸의 잠재 수준. 무기 종류 표본이 모자라면 같은 계열 무기 전체(scope "weapons"). 없으면 null.
 * @param {Map<string, { sample: number, levels: any[] }>} groups 묶음 → 대표 줄까지 붙인 수준
 * @param {{ family: string, slot: string, attackType: string }} query
 */
function findLevels(groups, { family, slot, attackType }) {
  const exact = groups.get(groupKey(family, slot, attackType));
  if (exact) return { scope: "slot", ...exact };
  if (ARMOR_SLOTS.has(slot)) return null;
  const weapons = groups.get(groupKey(family, ALL_WEAPONS, attackType));
  return weapons ? { scope: "weapons", ...weapons } : null;
}

module.exports = { FAMILIES, LEVELS, MIN_SAMPLE, groupKey, createLevelPicker, pickLevels, levelLines, findLevels };
