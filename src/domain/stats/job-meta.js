"use strict";

// Job meta (pure): what the strongest characters of one job actually wear. Input is each
// character's collected equipment (every preset); the main setup is the best-scoring item per
// equipment slot. Shares are the fraction of characters (0..1).

const itemSetData = require("../../game-data/item-sets.json");
const { resolveSets } = require("./sources/sets");

const TOP_ROWS = 5;
const ARMOR_SLOTS = ["무기", "모자", "상의", "하의", "한벌옷", "장갑", "신발", "망토", "어깨", "보조무기"];
// Accessory groups: ring and pendant slots count together.
const ACCESSORY_GROUPS = [
  ["반지", /^반지/],
  ["목걸이", /^목걸이/],
  ["귀고리", /^귀고리$/],
  ["눈장식", /^눈장식$/],
  ["얼굴장식", /^얼굴장식$/],
  ["포켓", /^포켓$/],
  ["벨트", /^벨트$/],
  ["뱃지", /^뱃지$/],
  ["엠블렘", /^엠블렘$/]
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

/** Option line label: attack lines with a % value get a "%" so they differ from flat attack. */
function lineLabel(option) {
  const name = String(option?.option_name || "").trim();
  const value = String(option?.option_value || "");
  return /공격력$/.test(name) && value.includes("%") ? `${name}%` : name;
}

/** "물리 대미지 ×3", "최종 대미지 + 물리 공격력% ×2" (most lines first). */
function comboLabel(options) {
  const counts = new Map();
  for (const option of toArray(options)) {
    const label = lineLabel(option);
    if (label) counts.set(label, (counts.get(label) || 0) + 1);
  }
  if (!counts.size) return "";
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([label, count]) => (count > 1 ? `${label} ×${count}` : label))
    .join(" + ");
}

function tally() {
  const counts = new Map();
  return {
    add(label) {
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    },
    rows(denominator, limit = TOP_ROWS) {
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

/** "아케인 7 · 칠흑 6" — sets with an active tier (at least 2 pieces, or a 1-piece set table). */
function setLabel(items) {
  const parts = [];
  for (const entry of resolveSets(items, itemSetData.sets).values()) {
    const tiers = entry.set.tiers.map((tier) => tier.count);
    // 효과는 가장 큰 단계까지만 붙는다(칠흑 9).
    const count = Math.min(entry.members.length + entry.extra.length, Math.max(...tiers));
    if (count >= 2 && count >= Math.min(...tiers)) parts.push([entry.set.label.replace(/ 세트/, "").replace(/ \(/, "("), count]);
  }
  return parts
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([label, count]) => `${label} ${count}`)
    .join(" · ");
}

/**
 * @param {Array<{ spec: { combatPower: number, itemScore: number, characterLevel: number }, items: any[] }>} characters
 *   equipment docs as stored (slot, itemName, starforce, score, item)
 */
function jobMeta(characters) {
  const list = toArray(characters).filter((entry) => toArray(entry.items).length);
  const count = list.length;
  const weapons = { item: tally(), potential: tally(), additional: tally(), flame: tally(), emblem: tally(), soul: tally() };
  let weaponCount = 0;
  let soulCount = 0;
  let emblemCount = 0;
  const sets = tally();
  const accessories = new Map(ACCESSORY_GROUPS.map(([group]) => [group, { tally: tally(), holders: 0 }]));
  const stars = new Map(ARMOR_SLOTS.map((slot) => [slot, { sum: 0, n: 0 }]));

  for (const { items } of list) {
    const setup = mainSetup(items);
    const weapon = setup.get("무기");
    if (weapon) {
      weaponCount += 1;
      const raw = weapon.item || {};
      weapons.item.add(weaponFamily(String(weapon.itemName || raw.item_name || "")));
      weapons.potential.add(comboLabel(raw.item_potential_option));
      weapons.additional.add(comboLabel(raw.item_additional_potential_option));
      weapons.flame.add(comboLabel(raw.item_additional_option));
      if (raw.soul_info?.soul_name) {
        soulCount += 1;
        weapons.soul.add(String(raw.soul_info.soul_name).trim());
      }
      if (raw.emblem_info?.emblem_name) {
        emblemCount += 1;
        weapons.emblem.add(String(raw.emblem_info.emblem_name).trim());
      }
    }
    sets.add(setLabel([...setup.values()].map((doc) => doc.item).filter(Boolean)));
    for (const [group, pattern] of ACCESSORY_GROUPS) {
      const names = new Set(
        [...setup.entries()]
          .filter(([slot]) => pattern.test(slot))
          .map(([, doc]) => String(doc.itemName || "").trim())
          .filter(Boolean)
      );
      const bucket = accessories.get(group);
      if (names.size) bucket.holders += 1;
      names.forEach((name) => bucket.tally.add(name));
    }
    for (const [slot, doc] of setup) {
      const star = stars.get(slot);
      if (star) {
        star.sum += Number(doc.starforce) || 0;
        star.n += 1;
      }
    }
  }

  const average = (key) => (count ? list.reduce((sum, entry) => sum + (Number(entry.spec?.[key]) || 0), 0) / count : 0);
  return {
    count,
    summary: {
      avgCombatPower: Math.round(average("combatPower")),
      minCombatPower: count ? Math.min(...list.map((entry) => Number(entry.spec?.combatPower) || 0)) : 0,
      avgItemScore: Math.round(average("itemScore") * 10) / 10,
      avgLevel: Math.round(average("characterLevel") * 10) / 10
    },
    weapon: {
      count: weaponCount,
      items: weapons.item.rows(weaponCount),
      potential: weapons.potential.rows(weaponCount),
      additional: weapons.additional.rows(weaponCount),
      flame: weapons.flame.rows(weaponCount),
      emblem: weapons.emblem.rows(emblemCount),
      soul: weapons.soul.rows(soulCount)
    },
    sets: sets.rows(count),
    accessories: ACCESSORY_GROUPS.map(([group]) => ({ group, rows: accessories.get(group).tally.rows(accessories.get(group).holders, 3) })).filter(
      (entry) => entry.rows.length
    ),
    // 상의·하의처럼 일부만 쓰는 칸(30% 미만)은 뺀다.
    starforce: ARMOR_SLOTS.map((slot) => ({
      slot,
      avg: stars.get(slot).n ? Math.round((stars.get(slot).sum / stars.get(slot).n) * 10) / 10 : null,
      n: stars.get(slot).n
    })).filter((entry) => entry.avg !== null && entry.n >= count * 0.3)
  };
}

module.exports = { jobMeta, mainSetup, comboLabel, lineLabel };
