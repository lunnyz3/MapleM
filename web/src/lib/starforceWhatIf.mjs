// 스타포스 바꿔 보기(순수 함수): 아이템 DB(src/game-data/item-db.json)의 단계별 기본 옵션 차이와,
// 스타포스 세트(src/game-data/starforce-sets.json) 합이 바뀌어 달라지는 구간 효과.

/**
 * 지금 단계 → 새 단계의 기본 옵션 줄(두 단계 모두 표에 있는 옵션만). 표에 없으면 null.
 * @param {{ stars: Record<string, Record<string, number>> }} entry @param {number} from @param {number} to
 * @returns {{ before: Array<{ name: string, value: string }>, after: Array<{ name: string, value: string }> } | null}
 */
export function basicChange(entry, from, to) {
  const a = entry?.stars?.[String(from)];
  const b = entry?.stars?.[String(to)];
  if (!a || !b) return null;
  const names = Object.keys(a).filter((name) => name in b);
  return {
    before: names.map((name) => ({ name, value: String(a[name]) })),
    after: names.map((name) => ({ name, value: String(b[name]) }))
  };
}

/** 세트 합 → 그 구간의 스탯(합은 cap 에서 자른다). */
export function setStatsAt(set, total, cap) {
  const capped = Math.min(Math.max(0, total), cap);
  let tier = null;
  for (const row of set?.tiers || []) if (capped >= row.min && (!tier || row.min > tier.min)) tier = row;
  return tier ? tier.stats : {};
}

/** 세트 합이 delta 만큼 바뀔 때 스탯 차이(스탯 출처 키). */
export function setChange(set, total, delta, cap) {
  const before = setStatsAt(set, total, cap);
  const after = setStatsAt(set, total + delta, cap);
  const out = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const value = (after[key] || 0) - (before[key] || 0);
    if (Math.abs(value) > 1e-9) out[key] = value;
  }
  return out;
}

/**
 * 내역(majorStats breakdown)에서 스타포스 세트별 지금 합: { 아케인: 280, … }(세트 이름 기준). 항목 이름
 * "아케인 280성"에서 세트 이름을, rawText "스타포스 합 291 (…)"에서 자르기 전 합을 읽는다.
 * @param {Record<string, any>} majorStats
 */
export function currentSetTotals(majorStats) {
  const totals = {};
  for (const stat of Object.values(majorStats || {})) {
    for (const entry of Array.isArray(stat?.breakdown) ? stat.breakdown : []) {
      if (entry?.group !== "starforceSet") continue;
      const label = /^(.+?) \d+성$/.exec(String(entry.source || ""))?.[1];
      const match = /스타포스 합 (\d+)/.exec(String(entry.rawText || ""));
      if (label && match) totals[label] = Number(match[1]);
    }
  }
  return totals;
}

/**
 * 이 장비가 들어가는 스타포스 세트(이름 규칙). 제네시스 무기는 럭키 아이템이라 무기 칸 세트(아케인)에 들어간다고 본다.
 * @param {{ sets: any[] }} rules @param {{ itemName: string, itemGrade?: string, slotName?: string }} item
 */
export function setOfItem(rules, item) {
  const name = String(item?.itemName || "");
  const grade = String(item?.itemGrade || "");
  const found = rules.sets.find((set) => {
    const { nameIncludes = [], namePrefixes = [], grade: needGrade } = set.match || {};
    const hit = nameIncludes.some((word) => name.includes(word)) || namePrefixes.some((prefix) => name.startsWith(prefix));
    return hit && (!needGrade || grade.includes(needGrade));
  });
  if (found) return found;
  return /제네시스/.test(name) && item?.slotName === "무기" ? rules.sets.find((set) => set.weaponSlot) || null : null;
}
