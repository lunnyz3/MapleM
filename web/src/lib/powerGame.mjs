// "누가 더 셀까?"(순수 함수): 모은 캐릭터 무리에서 둘을 골라 낸다. 연속으로 맞힐수록 두 전투력의 차이(배수)가 좁아진다.

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
  const key = (entry) => `${entry.world}/${entry.name}`;
  const fresh = pool.filter((entry) => entry.power > 0 && !used.has(key(entry)));
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
