// 장비 갈아타기 손익분기(순수 함수): 앱솔랩스 → 아케인셰이드, 아케인셰이드 무기 → 제네시스 무기로 바꿀 때 새 장비의
// 스타포스·잠재 수준별 보스 세팅 전투력 변화와 '지금보다 나아지는 최소 조합'.
// - 세트 효과는 서버(src/domain/stats/sources/sets.js)와 같은 규칙으로 바꾼 뒤 장비로 다시 센다: 2026-07-30 세트옵션 보정
//   (앱솔랩스 착용 중 세트옵션이 꺼진 아케인셰이드 1종은 앱솔랩스 1종으로, 그 별은 앱솔랩스 스타포스 합으로. 아케인 2종부터
//   보정 해제), 제네시스 무기 럭키(3개 이상 모인 무기 칸 세트마다 +1, 그 무기 별도 그 세트 합에).
// - 새 장비 = 아이템 DB 기본 옵션(무기만, 그 별) + 잠재 수준의 잠재·에디 줄 + 지금 장비의 추가 옵션·소울·문장(그대로 옮긴다고 본다).
//   방어구 기본 옵션은 방어력뿐이라 전투력에 들어가지 않는다. 제네시스 무기는 해방 무기 최종 대미지 +10%, 전수 불가.
// 표(item-sets.json, starforce-sets.json, character-base.json, enhance.json)와 전투력 함수는 인자로 받는다(Node 테스트용).
import { starforceExpectation } from "./enhanceCalc.mjs";
import { addTotals, deltaToTotals } from "./growthReport.mjs";
import { itemLines, splitStatText } from "./swapItem.mjs";
import { applyLineChanges } from "./whatIf.mjs";

export const ARCANE = "아케인셰이드";
export const GENESIS = "제네시스";
// 제네시스 무기는 받은 그대로 ★35로 본다(2026-11-01 운영 DB 제네시스 무기 1,109개 중 1,060개가 ★35·36, 낮은 것은 36 도전 중 하락).
export const GENESIS_START_STAR = 35;
// 아케인셰이드는 ★0부터 이 별까지(지금 장비 별이 더 높으면 그 별까지, 35 이하) 잰다.
export const SEARCH_STAR = 25;
const STAR_CAP = 35;
// 이보다 작은 차이(0.005%)는 같다고 본다.
const EPS = 5e-5;
const JOB_WORD = /(나이트|메이지|아처|시프|파이렛)/;

/** 잠재 수준: 없음 + 서버가 고른 하위 25%·중간·상위 25%(GET /api/v2/item-levels) */
export const NO_POTENTIAL = Object.freeze({ key: "none", label: "없음", score: 0, potential: [], additionalPotential: [] });

const toArray = (value) => (Array.isArray(value) ? value : []);
const nameOf = (item) => String(item?.itemName || "").trim();
const isWeapon = (item) => String(item?.slotName || "").trim() === "무기";
const starOf = (item) => {
  const star = Number(item?.starforceUpgrade);
  return Number.isFinite(star) && star > 0 ? star : 0;
};

/**
 * 이 장비를 바꿀 상위 계열: 앱솔랩스 → 아케인셰이드, 아케인셰이드 무기 → 제네시스. 없으면 "".
 * @param {any} item 화면 장비(itemName, slotName …)
 */
export function upgradeFamily(item) {
  const name = nameOf(item);
  if (name.includes("앱솔랩스")) return ARCANE;
  if (name.includes(ARCANE) && isWeapon(item)) return GENESIS;
  return "";
}

/** 잠재 수준 묶음의 부위: 무기는 무기 종류(장비창 페이지 이름), 방어구는 부위. */
export function levelSlot(item) {
  return isWeapon(item) ? String(item?.pageName || "").trim() || "무기" : String(item?.slotName || "").trim();
}

/**
 * 아이템 DB에서 새 장비: 무기는 같은 무기 종류(대여 장비 빼고), 방어구는 같은 부위·같은 직업 이름(나이트·메이지 …).
 * 무기는 표가 없으면 entry 가 null(공격력을 몰라 잴 수 없다). 방어구는 표가 없어도 이름만 지어 쓴다.
 * @param {{ items: Record<string, { slot: string, family: string, stars: Record<string, Record<string, number>> }> } | null} db
 * @param {any} item @param {string} family
 * @returns {{ name: string, entry: any }}
 */
export function targetOf(db, item, family) {
  const slot = levelSlot(item);
  const rows = Object.entries(db?.items || {}).filter(([name, entry]) => entry.family === family && entry.slot === slot && !name.startsWith("["));
  if (isWeapon(item)) {
    const [name, entry] = rows[0] || [];
    return { name: name || `${family} ${slot}`, entry: entry || null };
  }
  const job = JOB_WORD.exec(nameOf(item))?.[1];
  const [name, entry] = rows.find(([candidate]) => job && candidate.includes(job)) || rows[0] || [];
  return { name: name || `${family} ${slot}`, entry: entry || null };
}

function matchesSet(item, match = {}) {
  const name = nameOf(item);
  if (!name) return false;
  const byName =
    toArray(match.names).includes(name) ||
    toArray(match.namePrefixes).some((prefix) => name.startsWith(prefix)) ||
    toArray(match.nameIncludes).some((keyword) => name.includes(keyword));
  if (!byName) return false;
  return !match.grade || String(item?.itemGrade || "").trim() === match.grade;
}

/**
 * 세트마다 장비(서버 resolveSets 와 같은 규칙): 보정(borrow) 뒤 럭키(lucky).
 * @param {any[]} items @param {any[]} sets item-sets.json 또는 starforce-sets.json 의 sets @param {any} rules item-sets.json(borrow·lucky)
 * @returns {Map<string, { set: any, members: any[], extra: any[], borrowed: boolean, lucky: boolean }>}
 */
export function resolveSets(items, sets, rules) {
  const result = new Map();
  for (const set of sets) result.set(set.id, { set, members: items.filter((item) => matchesSet(item, set.match)), extra: [], borrowed: false, lucky: false });
  const { borrow, lucky } = rules;
  const host = result.get(borrow.host);
  const donor = result.get(borrow.donor);
  if (host && donor && host.members.length >= 1 && donor.members.length === borrow.donorCount) {
    host.extra.push(donor.members[0]);
    host.borrowed = true;
    donor.members = [];
  }
  const weapon = items.find(isWeapon);
  if (weapon && nameOf(weapon).includes(lucky.weaponKeyword)) {
    for (const entry of result.values()) {
      if (entry.set.weaponSlot && entry.members.length + entry.extra.length >= lucky.minCount && !entry.members.includes(weapon)) {
        entry.extra.push(weapon);
        entry.lucky = true;
      }
    }
  }
  return result;
}

/** 한벌옷은 상의·하의 두 칸이라 별이 두 배로 들어간다. */
function setStarOf(item) {
  const star = starOf(item);
  return String(item?.slotName || "").trim() === "한벌옷" ? star * 2 : star;
}

function addStats(out, stats) {
  for (const [key, value] of Object.entries(stats || {})) if (Number.isFinite(Number(value))) out[key] = (out[key] || 0) + Number(value);
}

/**
 * 장비들의 세트 효과 + 스타포스 세트 옵션 합(스탯 출처 키)과 세트별 개수·별 합.
 * @param {any[]} items @param {{ itemSets: any, starforceSets: any }} tables
 * @returns {{ stats: Record<string, number>, counts: Record<string, number>, stars: Record<string, number>, borrowed: boolean }}
 */
export function setStats(items, { itemSets, starforceSets }) {
  /** @type {Record<string, number>} */
  const stats = {};
  const counts = {};
  const stars = {};
  let borrowed = false;
  for (const [id, entry] of resolveSets(items, itemSets.sets, itemSets)) {
    const count = entry.members.length + entry.extra.length;
    if (!count) continue;
    counts[id] = count;
    borrowed = borrowed || entry.borrowed;
    let tier = null;
    for (const row of entry.set.tiers) if (row.count <= count && (!tier || row.count > tier.count)) tier = row;
    if (tier) addStats(stats, tier.stats);
  }
  for (const [id, entry] of resolveSets(items, starforceSets.sets, itemSets)) {
    const all = [...entry.members, ...entry.extra];
    if (!all.length) continue;
    const total = all.reduce((sum, item) => sum + setStarOf(item), 0);
    stars[id] = total;
    const capped = Math.min(total, starforceSets.cap);
    let tier = null;
    for (const row of entry.set.tiers) if (row.min <= capped && (!tier || row.min > tier.min)) tier = row;
    if (tier) addStats(stats, tier.stats);
  }
  return { stats, counts, stars, borrowed };
}

/** 무기 기본 옵션(아이템 DB 그 별). 표에 없는 별이면 null, 방어구는 빈 줄(방어력뿐). */
export function basicLines(entry, star, weapon) {
  if (!weapon) return [];
  const row = entry?.stars?.[String(star)];
  if (!row) return null;
  return Object.entries(row)
    .filter(([name]) => name)
    .map(([name, value]) => ({ name, value: String(value) }));
}

/** 지금 장비에서 새 장비로 옮긴다고 보는 줄: 추가 옵션·소울·문장. */
export function keptLines(item) {
  const emblem = item?.emblemInfo ? splitStatText(item.emblemInfo.emblem_option ?? item.emblemInfo.emblemOption) : [];
  return [
    ...toArray(item?.additionalOption).map((option) => ({ name: String(option?.name ?? ""), value: String(option?.value ?? "") })),
    ...splitStatText(item?.soulInfo?.soulOption),
    ...emblem
  ];
}

/** 지금 장비의 잠재·에디 줄(전수하면 그대로 옮긴다). */
export function ownLevel(item) {
  const lines = (list) => toArray(list).map((option) => ({ name: String(option?.name ?? ""), value: String(option?.value ?? "") }));
  return { key: "own", label: "지금 그대로", potential: lines(item?.potentialOption), additionalPotential: lines(item?.additionalPotentialOption) };
}

const liberated = (item, rule) => isWeapon(item) && rule.nameIncludes.some((keyword) => nameOf(item).includes(keyword));

/**
 * 여러 칸을 바꿔 낀 뒤 전투력 비율(0.012 = +1.2%). 무기 별이 표에 없으면 null.
 * @param {{ totals: Record<string, number>, items: any[], swaps: Array<{ target: any, star: number, level: any }>, attackType: string,
 *   tables: { itemSets: any, starforceSets: any, characterBase: any }, combatPower: (totals: any) => number }} input
 *   target: { from, name, entry, family } (switchTargets 결과)
 */
export function switchRatio({ totals, items, swaps, attackType, tables, combatPower }) {
  let next = { ...totals };
  const replaced = new Map();
  for (const { target, star, level } of swaps) {
    const { from } = target;
    const basic = basicLines(target.entry, star, isWeapon(from));
    if (!basic) return null;
    const lines = [...basic, ...keptLines(from), ...toArray(level?.potential), ...toArray(level?.additionalPotential)];
    next = applyLineChanges(next, itemLines(from), lines, attackType);
    const to = { itemName: target.name, slotName: from.slotName, pageName: from.pageName, itemGrade: from.itemGrade, starforceUpgrade: String(star) };
    replaced.set(from, to);
    const rule = tables.characterBase.liberationWeapon;
    const gain = (liberated(to, rule) ? 1 : 0) - (liberated(from, rule) ? 1 : 0);
    if (gain) next.finalDamage = (next.finalDamage || 0) + gain * rule.finalDamage;
  }
  const after = items.map((item) => replaced.get(item) || item);
  const before = setStats(items, tables).stats;
  const changed = setStats(after, tables).stats;
  /** @type {Record<string, number>} */
  const delta = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(changed)])) delta[key] = (changed[key] || 0) - (before[key] || 0);
  next = addTotals(next, deltaToTotals(delta, attackType));
  const base = combatPower(totals);
  return base > 0 ? combatPower(next) / base - 1 : null;
}

/**
 * 바꿀 칸들 → 계산에 쓸 모양. 무기는 아이템 DB 표에 있는 별만, 방어구는 0~SEARCH_STAR(바꿀 장비 중 지금 별이 더 높은 것이 있으면
 * 그 별까지, 여러 칸이면 모두 같은 범위).
 * @param {any} db item-db.json @param {any[]} picked 바꿀 지금 장비들(같은 계열로 바뀌는 것만)
 */
export function switchTargets(db, picked) {
  const highest = Math.min(STAR_CAP, Math.max(SEARCH_STAR, ...picked.map(starOf)));
  return picked.map((from) => {
    const family = upgradeFamily(from);
    const { name, entry } = targetOf(db, from, family);
    const start = family === GENESIS ? GENESIS_START_STAR : 0;
    const top = family === GENESIS ? STAR_CAP + 1 : highest;
    const known = isWeapon(from) ? Object.keys(entry?.stars || {}).map(Number) : null;
    const stars = [];
    for (let star = start; star <= top; star += 1) if (!known || known.includes(star)) stars.push(star);
    return { from, family, name, entry, start, stars };
  });
}

/**
 * 칸마다 ★start → ★star 평균 강화 횟수 합(강화 계산기와 같은 공식 확률표, 하락·파괴 방지를 켠 값 = 단계마다 1/성공률).
 * 방지 없이 재면 20성 위는 하락(15%)이 성공(6%)보다 잦아 횟수가 수만~수억으로 퍼지고 대부분 파괴로 끝나 '닿는 횟수'가 아니다.
 */
export function starCost(targets, star, enhanceRules) {
  let tries = 0;
  for (const target of targets) tries += starforceExpectation(enhanceRules, target.start, star, { protectDrop: true, protectDestroy: true }).tries;
  return { tries };
}

/**
 * 손익분기: 잠재 수준마다 지금보다 나아지는 가장 낮은 별(모든 칸 같은 별·같은 수준), 바로 끼면(가장 낮은 별·잠재 없음),
 * 전수하면(아케인셰이드만: 지금 별·지금 잠재 그대로), 세트 상태.
 * @param {{ totals: Record<string, number>, items: any[], targets: ReturnType<typeof switchTargets>, levels: any[][], attackType: string,
 *   tables: { itemSets: any, starforceSets: any, characterBase: any, enhance: any }, combatPower: (totals: any) => number }} input
 *   levels[i]: targets[i] 칸의 [하위 25%, 중간, 상위 25%] 대표 줄(모르면 빈 배열)
 */
export function breakEven({ totals, items, targets, levels, attackType, tables, combatPower }) {
  if (!targets.length) return null;
  const stars = targets.map((target) => target.stars).reduce((common, list) => common.filter((star) => list.includes(star)));
  const ratioAt = (star, levelOf) =>
    switchRatio({ totals, items, swaps: targets.map((target, index) => ({ target, star, level: levelOf(index) })), attackType, tables, combatPower });
  const ladder = [NO_POTENTIAL, ...(levels.every((list) => list?.length === 3) ? levels[0] : [])];
  const rows = ladder.map((level, rank) => {
    const levelOf = (index) => (rank === 0 ? NO_POTENTIAL : levels[index][rank - 1]);
    let found = null;
    let last = null;
    for (const star of stars) {
      const ratio = ratioAt(star, levelOf);
      if (ratio === null) continue;
      last = { star, ratio };
      if (ratio > EPS) {
        found = { star, ratio, ...starCost(targets, star, tables.enhance) };
        break;
      }
    }
    return { key: level.key, label: level.label, grades: rank ? levels.map((list) => list[rank - 1]) : [], found, top: found ? null : last };
  });
  const lowest = stars.length ? { star: stars[0], ratio: ratioAt(stars[0], () => NO_POTENTIAL) } : null;
  const genesis = targets.some((target) => target.family === GENESIS);
  let transfer = null;
  if (!genesis) {
    const swaps = targets.map((target) => ({ target, star: starOf(target.from), level: ownLevel(target.from) }));
    const ratio = switchRatio({ totals, items, swaps, attackType, tables, combatPower });
    if (ratio !== null) transfer = { ratio, stars: targets.map((target) => starOf(target.from)) };
  }
  const replaced = new Set(targets.map((target) => target.from));
  const afterItems = items.map((item) => {
    const target = targets.find((entry) => entry.from === item);
    return target ? { itemName: target.name, slotName: item.slotName, itemGrade: item.itemGrade, starforceUpgrade: String(target.start) } : item;
  });
  const before = setStats(items, tables);
  const after = setStats(afterItems, tables);
  return {
    stars,
    rows,
    lowest,
    transfer,
    genesis,
    sets: {
      before: before.counts,
      after: after.counts,
      // 보정이 걸리는지(아케인 1종이 앱솔 1종으로)와 아케인 세트가 새로 켜지는지
      borrowed: after.borrowed,
      arcaneOn: (after.counts.arcane || 0) >= 2 && (before.counts.arcane || 0) < 2,
      replaced: replaced.size
    }
  };
}

/**
 * 한 줄 결론에 쓸 행: 중간 잠재로 넘는 별이 있으면 그것(잠재 없이도 같은 별 이하로 넘으면 '잠재 없이'),
 * 없으면 넘는 가장 낮은 수준, 아무것도 못 넘으면 null.
 * @param {ReturnType<typeof breakEven>} result
 */
export function headlineRow(result) {
  const rows = result?.rows || [];
  const middle = rows.find((row) => row.key === "q50" && row.found);
  const none = rows.find((row) => row.key === "none" && row.found);
  if (middle && none && none.found.star <= middle.found.star) return none;
  return middle || rows.find((row) => row.found) || null;
}
