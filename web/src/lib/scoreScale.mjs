// 템환산 100점 환산(순수 함수): 원점수 ÷ 그 부위 최고 장비를 최대로 맞춘 점수 × 100(표 src/game-data/item-score-max.json).
// 캐릭터 합계는 한 벌 최대치(fullSet) 기준. 표는 인자로 받는다(웹은 web/src/lib/itemScore.js 가 넣어 준다).

/**
 * 부위 이름 → 표 키. 장비의 slotName("반지 (2번째 슬롯)", "무기") 또는 랭킹 행의 slot(무기 종류 이름, "모자")을 받는다.
 * @param {any} table @param {string} name
 */
export function scoreKey(table, name) {
  const text = String(name || "")
    .replace(/\s*\(\d+번째 슬롯\)\s*$/, "")
    .trim();
  if (text === "무기") return "무기";
  return table?.slots?.[text] ? text : "무기";
}

/**
 * 장비 하나의 100점 환산. 표에 없는 부위면 null.
 * @param {any} table @param {string} name 부위 @param {number} score 원점수 @param {{ emblem?: boolean }} [options]
 */
export function itemPoints(table, name, score, { emblem = true } = {}) {
  const slot = table?.slots?.[scoreKey(table, name)];
  const max = emblem ? slot?.max : slot?.maxWithoutEmblem;
  const value = Number(score);
  if (!(max > 0) || !Number.isFinite(value)) return null;
  return Math.min(100, (value / max) * 100);
}

/**
 * 캐릭터 장비 합계의 100점 환산(한 벌 최대치 기준).
 * @param {any} table @param {number} total 원점수 합 @param {{ emblem?: boolean }} [options]
 */
export function setPoints(table, total, { emblem = true } = {}) {
  const max = emblem ? table?.fullSet?.max : table?.fullSet?.maxWithoutEmblem;
  const value = Number(total);
  if (!(max > 0) || !Number.isFinite(value)) return null;
  return Math.min(100, (value / max) * 100);
}

/** "74.6" (소수 첫째 자리) */
export function pointsText(value) {
  return Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1) : "-";
}
