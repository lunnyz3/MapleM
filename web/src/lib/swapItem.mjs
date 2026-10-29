// 장비 바꿔 끼기(순수 함수): 내 장비를 다른 사람 장비로 바꾸면 보스 세팅 스탯이 어떻게 바뀌는지.
// 장비 한 개의 스탯 = 기본 옵션(같은 스탯의 추가 옵션이 이미 들어 있다) + 기본 옵션에 없는 추가 옵션 + 잠재 + 에디 + 소울 + 문장.
import { applyLineChanges } from "./whatIf.mjs";

/** @param {any[]} options */
const linesOf = (options) =>
  (Array.isArray(options) ? options : []).map((option) => ({
    name: String(option?.name ?? option?.option_name ?? "").trim(),
    value: String(option?.value ?? option?.option_value ?? "").trim()
  }));

/** "최대 대미지 119,000,000, 치명타 피해 15%" → 줄들 */
export function splitStatText(text) {
  return String(text || "")
    .split(/,\s+(?=[^\d])/)
    .map((part) => /^(.*?)\s*([+-]?[\d,.]+%?)\s*$/.exec(part.trim()))
    .filter(Boolean)
    .map((match) => ({ name: match[1].trim(), value: match[2] }));
}

/** 장비 한 개가 주는 옵션 줄 전부(화면용 장비 모양: basicOption, additionalOption, potentialOption …). */
export function itemLines(item) {
  const basic = linesOf(item?.basicOption);
  const basicNames = new Set(basic.map((line) => line.name));
  const flames = linesOf(item?.additionalOption).filter((line) => !basicNames.has(line.name));
  const emblem = item?.emblemInfo ? splitStatText(item.emblemInfo.emblem_option ?? item.emblemInfo.emblemOption) : [];
  return [
    ...basic,
    ...flames,
    ...linesOf(item?.potentialOption),
    ...linesOf(item?.additionalPotentialOption),
    ...splitStatText(item?.soulInfo?.soulOption),
    ...emblem
  ];
}

/**
 * 내 장비 → 다른 장비로 바꾼 합계. setDelta: 스타포스 세트 등 따로 더할 차이(효율 계산 키).
 * @param {Record<string, number>} totals @param {any} mine @param {any} theirs @param {string} attackType @param {Record<string, number>} [setDelta]
 */
export function swapTotals(totals, mine, theirs, attackType, setDelta = {}) {
  const next = applyLineChanges(totals, itemLines(mine), itemLines(theirs), attackType);
  for (const [key, value] of Object.entries(setDelta)) next[key] = (next[key] || 0) + value;
  return next;
}
