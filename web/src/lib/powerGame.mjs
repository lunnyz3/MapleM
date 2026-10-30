// 미니게임(순수 함수). "누가 더 셀까?"는 모은 캐릭터 무리에서 둘을 골라 낸다(연속으로 맞힐수록 두 전투력의 차이가 좁아진다).
// "전투력 맞히기"는 한 명씩 골라 슬라이더(전투력의 log10)로 받은 답을 정답과 몇 배 차이 나는지로 매긴다.

export const GUESS_ROUNDS = 5;
const keyOf = (entry) => `${entry.world}/${entry.name}`;

/** 연속 맞힌 수 → 두 전투력 배수 범위 [최소, 최대] */
export function ratioBand(streak) {
  if (streak >= 10) return [1.02, 1.12];
  if (streak >= 6) return [1.08, 1.25];
  if (streak >= 3) return [1.2, 1.5];
  return [1.4, 3];
}

/**
 * 아직 안 나온 캐릭터 중 하나를 고르고, 배수 범위에 드는 짝을 찾는다(없으면 범위를 넓혀 가장 가까운 짝).
 * @param {Array<{ name: string, world: string, power: number }>} pool @param {Set<string>} used @param {number} streak
 * @returns {[any, any] | null}
 */
export function pickPair(pool, used, streak, random = Math.random) {
  const fresh = pool.filter((entry) => entry.power > 0 && !used.has(keyOf(entry)));
  if (fresh.length < 2) return null;
  const [low, high] = ratioBand(streak);
  const order = [...fresh].sort(() => random() - 0.5);
  for (const first of order.slice(0, 40)) {
    const matches = fresh.filter((other) => {
      if (other === first) return false;
      const ratio = Math.max(first.power, other.power) / Math.min(first.power, other.power);
      return ratio >= low && ratio <= high;
    });
    if (matches.length) {
      const second = matches[Math.floor(random() * matches.length)];
      return random() < 0.5 ? [first, second] : [second, first];
    }
  }
  // 범위에 드는 짝이 없으면: 범위 가운데에 가장 가까운 짝
  const target = (low + high) / 2;
  const first = order[0];
  const second = fresh
    .filter((other) => other !== first && other.power !== first.power)
    .sort(
      (a, b) =>
        Math.abs(Math.max(a.power, first.power) / Math.min(a.power, first.power) - target) -
        Math.abs(Math.max(b.power, first.power) / Math.min(b.power, first.power) - target)
    )[0];
  return second ? [first, second] : null;
}

/**
 * 아직 안 나온 캐릭터 하나(다 나왔으면 null).
 * @param {Array<{ name: string, world: string, power: number }>} pool @param {Set<string>} used
 */
export function pickOne(pool, used, random = Math.random) {
  const fresh = pool.filter((entry) => entry.power > 0 && !used.has(keyOf(entry)));
  return fresh.length ? fresh[Math.floor(random() * fresh.length)] : null;
}

/** 한 문제 점수 0~1000: 맞히면 1000, 10% 차이면 약 760, 두 배 차이면 약 130. */
export function guessPoints(guess, actual) {
  if (!(guess > 0) || !(actual > 0)) return 0;
  return Math.round(1000 * Math.exp(-Math.abs(Math.log10(guess / actual)) / 0.15));
}

/** 다섯 문제 합계 → 칭호 */
export function guessTitle(total) {
  if (total >= 4500) return "전투력 감별사";
  if (total >= 3800) return "장비창 고수";
  if (total >= 3000) return "눈썰미 좋음";
  if (total >= 2000) return "감 잡는 중";
  return "다시 도전!";
}

/** 1·2·3·5 × 10ⁿ 가운데 value 이상인 가장 작은 수(3.4억 → 5억). */
function niceCeil(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 3, 5, 10].map((step) => step * magnitude).find((candidate) => candidate >= value * (1 - 1e-12));
}

/** 슬라이더 범위(전투력의 log10): 1천만부터 무리에서 가장 높은 전투력을 넘는 어림수까지, 처음 자리는 가운데값. */
export function sliderRange(pool) {
  const powers = pool.map((entry) => Number(entry.power)).filter((power) => power > 0).sort((a, b) => a - b);
  const min = 7;
  if (!powers.length) return { min, max: 9, start: 8 };
  const max = Math.max(min + 1, Math.log10(niceCeil(powers[powers.length - 1])));
  const start = Math.min(max, Math.max(min, Math.log10(powers[powers.length >> 1])));
  return { min, max, start: Math.round(start * 1000) / 1000 };
}

/** 유효 숫자 세 자리(3,248만 → 3,250만). */
export function roundPower(value) {
  if (!(value > 0)) return 0;
  const scale = 10 ** (Math.floor(Math.log10(value)) - 2);
  return Math.round(value / scale) * scale;
}
