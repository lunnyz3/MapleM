// 스펙업 추천(순수 함수): 장비 한 개를 ★+1 하거나 다른 장비로 바꿨을 때의 보스 세팅 스탯 합계.
// 전투력은 화면이 efficiency.js combatPower 로 잰다(이 파일은 Node 테스트에서도 읽히게 .mjs 만 가져온다).
import { starforceExpectation } from "./enhanceCalc.mjs";
import { addTotals, deltaToTotals } from "./growthReport.mjs";
import { basicChange, setChange, setOfItem } from "./starforceWhatIf.mjs";
import { swapTotals } from "./swapItem.mjs";
import { applyLineChanges } from "./whatIf.mjs";

/**
 * "…로 / …으로": 마지막 글자 받침(ㄹ 받침은 로), 숫자는 읽는 소리(0·3·6 → 으로).
 * @param {string} word
 */
export function withRo(word) {
  const text = String(word || "");
  const code = text.charCodeAt(text.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const final = (code - 0xac00) % 28;
    return `${text}${final === 0 || final === 8 ? "로" : "으로"}`;
  }
  return `${text}${/[036]$/.test(text) ? "으로" : "로"}`;
}

/** 다른 장비로 바꾸기 문구: "커맨더 포스 이어링으로 바꾸기", "제네시스 피스톨 ★35로 바꾸기" @param {any} other */
export function swapText(other) {
  const star = Number(other?.starforceUpgrade) || 0;
  return `${withRo(`${other?.itemName || ""}${star ? ` ★${star}` : ""}`)} 바꾸기`;
}

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
 * 강화 계획에 평균 강화 횟수·도중 파괴 확률·1회당 상승을 붙인다(방지권·럭키데이 없이, 강화 계산기와 같은 표).
 * @template {{ item: any, toStar: number, gain: number }} T
 * @param {T} plan @param {any} rules enhance.json
 * @returns {T & { tries: number, destroyChance: number, perTry: number }}
 */
export function withStarCost(plan, rules) {
  const from = Number(plan.item?.starforceUpgrade) || 0;
  const { tries, destroyChance } = starforceExpectation(rules, from, plan.toStar);
  return { ...plan, tries, destroyChance, perTry: Number.isFinite(tries) && tries > 0 ? plan.gain / tries : 0 };
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
 * 목표(need: 올려야 하는 비율, 0.094 = +9.4%)까지: 장비마다 가장 많이 오르는 것 하나씩 고른다. 남은 몫을 혼자 채우는
 * 계획이 있으면 그중 가장 작은 것(목표를 크게 넘지 않게), 없으면 가장 많이 오르는 것부터. 혼자 채우는 것이 남은 몫의
 * 세 배를 넘고 그보다 작은 것들로도 채울 수 있으면 작은 것부터(제네시스 무기 같은 큰 교체 하나보다 작은 것 여럿).
 * 서로 다른 장비의 상승은 곱으로 쌓인다고 본다(전투력 식이 곱이라 대략 맞다).
 * @template {{ gain: number, item: any }} T
 * @param {T[]} plans @param {number} need
 * @returns {{ steps: Array<T & { total: number }>, total: number, reached: boolean }}
 */
export function planToTarget(plans, need) {
  const best = new Map();
  for (const plan of plans) {
    if (!(Number.isFinite(plan.gain) && plan.gain > 1e-6)) continue;
    const key = plan.item?.fingerprint || `${plan.item?.slotName}|${plan.item?.itemName}`;
    if (!best.has(key) || plan.gain > best.get(key).gain) best.set(key, plan);
  }
  const pool = [...best.values()].sort((a, b) => b.gain - a.gain);
  const steps = [];
  let total = 0;
  while (pool.length && total < need) {
    const rest = (1 + need) / (1 + total) - 1;
    let pick = -1;
    for (let i = pool.length - 1; i >= 0; i -= 1) {
      if (pool[i].gain >= rest) {
        pick = i;
        break;
      }
    }
    if (pick >= 0 && pool[pick].gain > rest * 3) {
      const smaller = pool.slice(pick + 1);
      if (smaller.reduce((product, plan) => product * (1 + plan.gain), 1) - 1 >= rest) pick += 1;
    }
    if (pick < 0) pick = 0;
    const [plan] = pool.splice(pick, 1);
    total = (1 + total) * (1 + plan.gain) - 1;
    steps.push({ ...plan, total });
  }
  return { steps, total, reached: total >= need };
}

/**
 * 오르는 것만, by(기본 gain)가 큰 순으로 limit 개.
 * @template {{ gain: number }} T
 * @param {T[]} plans @param {number} [limit] @param {string} [by]
 */
export function rankPlans(plans, limit = 10, by = "gain") {
  return plans
    .filter((plan) => Number.isFinite(plan.gain) && plan.gain > 1e-6)
    .sort((a, b) => (Number(b[by]) || 0) - (Number(a[by]) || 0))
    .slice(0, limit);
}
