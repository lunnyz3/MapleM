"use strict";

// Job meta (pure): what the strongest characters of one job actually wear. Input is each
// character's collected equipment (every preset); the main setup is the best-scoring item per
// equipment slot. Shares are the fraction of characters (0..1). Option values are the API values
// (equipment mastery included).
//
// Weapon: potential / additional potential = sum of the job's own damage % lines, flames = flame
// score (the item score's flame part ÷ the best flame part of that slot × 100). Each has
// "at least N" buckets and a ranking. Accessories: share at max starforce and a flame-score ranking.

const scoreMax = require("../../game-data/item-score-max.json");

const RANK_LIMIT = 100;
const ACCESSORY_RANK_LIMIT = 50;
const BUCKETS = 5;
// Accessory groups: ring and pendant slots count together. maxStar: full enhancement.
const ACCESSORY_GROUPS = [
  { group: "반지", pattern: /^반지/, slot: "반지", maxStar: 10 },
  { group: "목걸이", pattern: /^목걸이/, slot: "목걸이", maxStar: 10 },
  { group: "귀고리", pattern: /^귀고리$/, slot: "귀고리", maxStar: 10 },
  { group: "눈장식", pattern: /^눈장식$/, slot: "눈장식", maxStar: 10 },
  { group: "얼굴장식", pattern: /^얼굴장식$/, slot: "얼굴장식", maxStar: 10 },
  { group: "포켓", pattern: /^포켓$/, slot: "포켓", maxStar: 10 },
  { group: "벨트", pattern: /^벨트$/, slot: "벨트", maxStar: 15 },
  { group: "뱃지", pattern: /^뱃지$/, slot: "뱃지", maxStar: 10 },
  { group: "엠블렘", pattern: /^엠블렘$/, slot: "엠블렘", maxStar: 10 }
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function slotOf(doc) {
  return String(doc?.item?.item_equipment_slot_name || doc?.slot || "").trim();
}

/** Best-scoring item per equipment slot (ties: higher starforce). */
function mainSetup(docs) {
  const bySlot = new Map();
  for (const doc of toArray(docs)) {
    const slot = slotOf(doc);
    if (!slot) continue;
    const best = bySlot.get(slot);
    if (!best || doc.score > best.score || (doc.score === best.score && (doc.starforce || 0) > (best.starforce || 0))) bySlot.set(slot, doc);
  }
  return bySlot;
}

const numberOf = (text) => Number(String(text ?? "").replace(/[^0-9.\-]/g, "")) || 0;

/** Sum of the lines named `name` (e.g. "물리 대미지"). */
function lineSum(options, name) {
  return toArray(options).reduce((sum, option) => sum + (String(option?.option_name || "").trim() === name ? numberOf(option.option_value) : 0), 0);
}

/** "물리 공격력 3,051 · 최종 대미지 6%" */
function linesText(options) {
  return toArray(options)
    .map((option) => `${String(option?.option_name || "").trim()} ${String(option?.option_value || "").trim()}`.trim())
    .filter(Boolean)
    .join(" · ");
}

/** Flame score 0~100: the flame part of the item score ÷ the best flame part of that slot. */
function flameScore(doc, slot) {
  const best = Number(scoreMax.slots?.[slot]?.additional) || 0;
  const part = Number(doc?.parts?.additional) || 0;
  return best > 0 ? Math.round(Math.min(100, (part / best) * 100) * 10) / 10 : 0;
}

/** "At least N" buckets (multiples of step, from the highest value down) over every character. */
function buckets(values, count, step) {
  if (!count || !values.length) return [];
  const top = Math.floor(Math.max(...values) / step) * step;
  const rows = [];
  for (let min = top; min > 0 && rows.length < BUCKETS; min -= step) {
    const share = values.filter((value) => value >= min - 1e-9).length / count;
    rows.push({ min, share });
    if (share >= 0.95) break;
  }
  return rows;
}

function tally() {
  const counts = new Map();
  return {
    add(label) {
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    },
    rows(denominator, limit = 5) {
      if (!denominator) return [];
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
        .slice(0, limit)
        .map(([label, count]) => ({ label, share: count / denominator }));
    }
  };
}

function weaponFamily(name) {
  if (name.includes("제네시스")) return "제네시스";
  if (name.includes("아케인셰이드")) return "아케인셰이드";
  if (name.includes("앱솔랩스")) return "앱솔랩스";
  return "그 밖의 무기";
}

const byValue = (a, b) => b.value - a.value || a.name.localeCompare(b.name, "ko");

/**
 * @param {Array<{ spec: { characterName?: string, worldName?: string, attackType?: string, combatPower: number, itemScore: number, characterLevel: number }, items: any[] }>} characters
 *   equipment docs as stored (slot, itemName, starforce, score, parts, item)
 */
function jobMeta(characters) {
  const list = toArray(characters).filter((entry) => toArray(entry.items).length);
  const count = list.length;
  const magical = list.filter((entry) => entry.spec?.attackType === "magical").length > count / 2;
  const damageName = magical ? "마법 대미지" : "물리 대미지";

  const families = tally();
  const emblems = tally();
  const souls = tally();
  let weaponCount = 0;
  let soulCount = 0;
  let emblemCount = 0;
  const weaponRows = { potential: [], additional: [], flame: [] };
  const accessories = new Map(ACCESSORY_GROUPS.map((entry) => [entry.group, { items: 0, maxed: 0, ranking: [] }]));

  for (const { spec, items } of list) {
    const who = { name: String(spec?.characterName || ""), world: String(spec?.worldName || "") };
    const setup = mainSetup(items);
    const weapon = setup.get("무기");
    if (weapon) {
      weaponCount += 1;
      const raw = weapon.item || {};
      families.add(weaponFamily(String(weapon.itemName || raw.item_name || "")));
      weaponRows.potential.push({
        ...who,
        value: Math.round(lineSum(raw.item_potential_option, damageName) * 100) / 100,
        text: linesText(raw.item_potential_option)
      });
      weaponRows.additional.push({
        ...who,
        value: Math.round(lineSum(raw.item_additional_potential_option, damageName) * 100) / 100,
        text: linesText(raw.item_additional_potential_option)
      });
      weaponRows.flame.push({ ...who, value: flameScore(weapon, "무기"), text: linesText(raw.item_additional_option) });
      if (raw.soul_info?.soul_name) {
        soulCount += 1;
        souls.add(String(raw.soul_info.soul_name).trim());
      }
      if (raw.emblem_info?.emblem_name) {
        emblemCount += 1;
        emblems.add(String(raw.emblem_info.emblem_name).trim());
      }
    }
    for (const [slot, doc] of setup) {
      const rule = ACCESSORY_GROUPS.find((entry) => entry.pattern.test(slot));
      if (!rule) continue;
      const bucket = accessories.get(rule.group);
      bucket.items += 1;
      if ((Number(doc.starforce) || 0) >= rule.maxStar) bucket.maxed += 1;
      bucket.ranking.push({
        ...who,
        itemName: String(doc.itemName || "").trim(),
        starforce: Number(doc.starforce) || 0,
        value: flameScore(doc, rule.slot),
        text: linesText(doc.item?.item_additional_option)
      });
    }
  }

  const section = (rows, step) => ({
    buckets: buckets(
      rows.map((row) => row.value),
      weaponCount,
      step
    ),
    ranking: [...rows].sort(byValue).slice(0, RANK_LIMIT)
  });
  const average = (key) => (count ? list.reduce((sum, entry) => sum + (Number(entry.spec?.[key]) || 0), 0) / count : 0);
  return {
    count,
    damageName,
    summary: {
      avgCombatPower: Math.round(average("combatPower")),
      minCombatPower: count ? Math.min(...list.map((entry) => Number(entry.spec?.combatPower) || 0)) : 0,
      avgItemScore: Math.round(average("itemScore") * 10) / 10,
      avgLevel: Math.round(average("characterLevel") * 10) / 10
    },
    weapon: {
      count: weaponCount,
      items: families.rows(weaponCount),
      potential: section(weaponRows.potential, 5),
      additional: section(weaponRows.additional, 5),
      flame: section(weaponRows.flame, 10),
      emblem: emblems.rows(emblemCount),
      soul: souls.rows(soulCount)
    },
    accessories: ACCESSORY_GROUPS.map(({ group, maxStar }) => {
      const bucket = accessories.get(group);
      return {
        group,
        maxStar,
        items: bucket.items,
        maxedShare: bucket.items ? bucket.maxed / bucket.items : 0,
        avgFlame: bucket.items ? Math.round((bucket.ranking.reduce((sum, row) => sum + row.value, 0) / bucket.items) * 10) / 10 : 0,
        ranking: bucket.ranking
          .filter((row) => row.value > 0)
          .sort(byValue)
          .slice(0, ACCESSORY_RANK_LIMIT)
      };
    }).filter((entry) => entry.items)
  };
}

// ---------------- 직업 1위와 비교 ----------------

// 반지·목걸이는 칸 번호가 사람마다 달라, 점수 높은 순으로 "반지 1", "반지 2"…로 맞춰 비교한다.
const PAIRED = [
  ["반지", /^반지/],
  ["목걸이", /^목걸이/]
];

/** 메인 세팅 → { 비교 칸: 장비 }. */
function compareSlots(docs) {
  const out = new Map();
  const grouped = new Map(PAIRED.map(([name]) => [name, []]));
  for (const [slot, doc] of mainSetup(docs)) {
    const pair = PAIRED.find(([, pattern]) => pattern.test(slot));
    if (pair) grouped.get(pair[0]).push(doc);
    else out.set(slot, doc);
  }
  for (const [name, list] of grouped) list.sort((a, b) => b.score - a.score).forEach((doc, index) => out.set(`${name} ${index + 1}`, doc));
  return out;
}

const round1 = (value) => Math.round(value * 10) / 10;

function sideOf(slots) {
  const out = {};
  let total = 0;
  for (const [slot, doc] of slots) {
    out[slot] = {
      itemName: String(doc.itemName || ""),
      score: round1(Number(doc.score) || 0),
      starforce: Number(doc.starforce) || 0,
      icon: String(doc.item?.item_icon || "")
    };
    total += Number(doc.score) || 0;
  }
  return { total: round1(total), slots: out };
}

/**
 * 내 메인 세팅과 직업 1위·상위 N명 평균의 칸별 템환산(원점수).
 * @param {{ top: Array<{ ocid: string, characterName?: string, worldName?: string, combatPower?: number }>, docs: any[], mine: any[] }} input
 *   top: 전투력 순 상위 캐릭터, docs: 그 캐릭터들의 장비, mine: 내 장비
 */
function jobTopCompare({ top, docs, mine }) {
  const byOcid = new Map();
  for (const doc of toArray(docs)) {
    if (!byOcid.has(doc.ocid)) byOcid.set(doc.ocid, []);
    byOcid.get(doc.ocid).push(doc);
  }
  const setups = toArray(top)
    .map((spec) => ({ spec, slots: compareSlots(byOcid.get(spec.ocid) || []) }))
    .filter((entry) => entry.slots.size);
  if (!setups.length) return { me: sideOf(compareSlots(mine)), leader: null, average: null };
  const [first] = setups;
  const sums = new Map();
  for (const { slots } of setups) for (const [slot, doc] of slots) sums.set(slot, (sums.get(slot) || 0) + (Number(doc.score) || 0));
  const averageSlots = {};
  for (const [slot, sum] of sums) averageSlots[slot] = round1(sum / setups.length);
  return {
    me: sideOf(compareSlots(mine)),
    leader: {
      ocid: String(first.spec.ocid || ""),
      name: String(first.spec.characterName || ""),
      world: String(first.spec.worldName || ""),
      combatPower: Number(first.spec.combatPower) || 0,
      ...sideOf(first.slots)
    },
    average: { count: setups.length, total: round1([...sums.values()].reduce((sum, value) => sum + value, 0) / setups.length), slots: averageSlots }
  };
}

module.exports = { jobMeta, mainSetup, lineSum, flameScore, buckets, compareSlots, jobTopCompare };
