// 스펙업 추천(순수 함수): 장비 한 개를 ★+1 하거나 다른 장비로 바꿨을 때의 보스 세팅 스탯 합계.
// 전투력은 화면이 efficiency.js combatPower 로 잰다(이 파일은 Node 테스트에서도 읽히게 .mjs 만 가져온다).
import { addTotals, deltaToTotals } from "./growthReport.mjs";
import { basicChange, setChange, setOfItem } from "./starforceWhatIf.mjs";
import { swapTotals } from "./swapItem.mjs";
import { applyLineChanges } from "./whatIf.mjs";

/** 한벌옷은 상의·하의 두 칸이라 세트 합이 두 배로 움직인다 */
const setStep = (item) => (item?.slotName === "한벌옷" ? 2 : 1);

/**
 * 지금 별 위로 아이템 DB(단계별 기본 옵션)에 있는 가장 가까운 단계(최대 maxJump 위). 지금 단계가 없거나 위가 없으면 null.
 * @param {any} dbEntry @param {number} current
 */
export function nextKnownStar(dbEntry, current, maxJump = 3) {
  if (!dbEntry?.stars?.[String(current)]) return null;
  for (let star = current + 1; star <= current + maxJump; star += 1) if (dbEntry.stars[String(star)]) return star;
  return null;
}

/**
 * 다음 단계(nextKnownStar)로 올렸을 때 합계와 그 단계. 못 재면 null.
 * @param {{ totals: Record<string, number>, item: any, dbEntry: any, sets: any, setTotals: Record<string, number>, attackType: string }} input
 * @returns {{ totals: Record<string, number>, toStar: number } | null}
 */
export function starUpTotals({ totals, item, dbEntry, sets, setTotals, attackType }) {
  const current = Number(item?.starforceUpgrade) || 0;
  const toStar = nextKnownStar(dbEntry, current);
  const basic = toStar ? basicChange(dbEntry, current, toStar) : null;
  if (!basic) return null;
  let next = applyLineChanges(totals, basic.before, basic.after, attackType);
  const set = setOfItem(sets, item);
  const setTotal = set ? setTotals[set.label] : undefined;
  if (set && Number.isFinite(setTotal)) next = addTotals(next, deltaToTotals(setChange(set, setTotal, (toStar - current) * setStep(item), sets.cap), attackType));
  return { totals: next, toStar };
}

/**
 * 다른 장비로 바꿨을 때 합계(같은 스타포스 세트면 세트 합 차이도).
 * @param {{ totals: Record<string, number>, item: any, other: any, sets: any, setTotals: Record<string, number>, attackType: string }} input
 */
export function swapUpTotals({ totals, item, other, sets, setTotals, attackType }) {
  const mine = setOfItem(sets, item);
  const theirs = setOfItem(sets, other);
  let setDelta = {};
  if (mine && theirs && theirs.id === mine.id && Number.isFinite(setTotals[mine.label])) {
    const stars = (Number(other?.starforceUpgrade) || 0) - (Number(item?.starforceUpgrade) || 0);
    setDelta = deltaToTotals(setChange(mine, setTotals[mine.label], stars * setStep(item), sets.cap), attackType);
  }
  return swapTotals(totals, item, other, attackType, setDelta);
}

/**
 * 오르는 것만, 많이 오르는 순으로 limit 개.
 * @template {{ gain: number }} T
 * @param {T[]} plans
 */
export function rankPlans(plans, limit = 10) {
  return plans
    .filter((plan) => Number.isFinite(plan.gain) && plan.gain > 1e-6)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit);
}
