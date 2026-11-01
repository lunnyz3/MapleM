// 강화 계산기(순수 함수): 스타포스 기댓값·시뮬레이션, 문장 강화, 장신구 연마, 장비 전수, 길드 어빌리티.
// 표는 src/game-data/enhance.json 을 인자로 받는다.

/**
 * 한 번 강화할 때 결과 확률(%). 일반 장비: 공식 확률표(2026-07-30 스타캐치 삭제 뒤) 그대로, 럭키데이는 성공에 더하고
 * 남는 확률을 유지·하락·파괴에 원래 비율대로 나눈다. 방지를 켜면 하락·파괴가 유지가 된다. 장신구(최대 10성): 연마 표 확률, 실패하면 유지.
 * @param {any} rules enhance.json 전체
 * @param {number} star 지금 성(0부터) @param {{ lucky?: number, protectDrop?: boolean, protectDestroy?: boolean, accessory?: boolean }} options
 * @returns {{ success: number, stay: number, drop: number, destroy: number }}
 */
export function starforceOdds(rules, star, { lucky = 0, protectDrop = false, protectDestroy = false, accessory = false } = {}) {
  if (accessory) {
    const success = (rules.polish.tracks.other.probability[star] ?? 0) * 100;
    return { success, stay: 100 - success, drop: 0, destroy: 0 };
  }
  const [base, stay, drop, destroy] = rules.starforce.rates[String(star + 1)] || [0, 100, 0, 0];
  const success = Math.min(100, base + lucky);
  const rest = 100 - base;
  const scale = rest > 0 ? (100 - success) / rest : 0;
  const odds = { success, stay: stay * scale, drop: drop * scale, destroy: destroy * scale };
  if (protectDrop) {
    odds.stay += odds.drop;
    odds.drop = 0;
  }
  if (protectDestroy) {
    odds.stay += odds.destroy;
    odds.destroy = 0;
  }
  return odds;
}

/**
 * 지금 성 → 목표 성 기댓값(정확한 해: 성마다 선형식을 풀어서). 파괴되면 거기서 끝난 것으로 본다.
 * @returns {{ tries: number, destroyChance: number }} tries: 목표 도달 또는 파괴까지 평균 강화 횟수
 */
export function starforceExpectation(rules, from, to, options = {}) {
  if (to <= from) return { tries: 0, destroyChance: 0 };
  const size = to; // 상태 0..to-1 (하락으로 from 아래로도 갈 수 있다)
  // E[s] = 1 + p·E[s+1] + q·E[s] + d·E[s-1] (파괴·목표는 0) → 한 줄씩 정리한 일차 연립방정식.
  /** @param {(odds: any) => number} constant */
  const solve = (constant) => {
    const matrix = Array.from({ length: size }, () => new Array(size + 1).fill(0));
    for (let s = 0; s < size; s += 1) {
      const odds = starforceOdds(rules, s, options);
      const p = odds.success / 100;
      const q = odds.stay / 100;
      const d = s > 0 ? odds.drop / 100 : 0;
      const row = matrix[s];
      row[s] += 1 - q - (s === 0 ? odds.drop / 100 : 0);
      if (s + 1 < size) row[s + 1] -= p;
      if (s > 0) row[s - 1] -= d;
      row[size] = constant(odds);
    }
    // 가우스 소거(크기 ≤ 36)
    for (let col = 0; col < size; col += 1) {
      let pivot = col;
      for (let r = col + 1; r < size; r += 1) if (Math.abs(matrix[r][col]) > Math.abs(matrix[pivot][col])) pivot = r;
      [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
      const lead = matrix[col][col];
      if (Math.abs(lead) < 1e-15) return new Array(size).fill(Infinity);
      for (let c = col; c <= size; c += 1) matrix[col][c] /= lead;
      for (let r = 0; r < size; r += 1) {
        if (r === col || !matrix[r][col]) continue;
        const factor = matrix[r][col];
        for (let c = col; c <= size; c += 1) matrix[r][c] -= factor * matrix[col][c];
      }
    }
    return matrix.map((row) => row[size]);
  };
  const tries = solve(() => 1)[from];
  const destroyChance = solve((odds) => odds.destroy / 100)[from];
  return { tries, destroyChance: Math.min(1, Math.max(0, destroyChance)) };
}

/**
 * 한 번 돌려 보기: 목표에 닿거나 파괴될 때까지(최대 limit 회).
 * @param {() => number} random 0 이상 1 미만
 * @returns {{ star: number, tries: number, destroyed: boolean, drops: number, dropProtections: number, destroyProtections: number }}
 */
export function simulateStarforce(rules, from, to, options = {}, random = Math.random, limit = 200000) {
  let star = from;
  let tries = 0;
  let drops = 0;
  let destroyed = false;
  let dropProtections = 0;
  let destroyProtections = 0;
  while (star < to && tries < limit) {
    const raw = starforceOdds(rules, star, { ...options, protectDrop: false, protectDestroy: false });
    tries += 1;
    if (!options.accessory) {
      if (options.protectDrop) dropProtections += 1;
      if (options.protectDestroy) destroyProtections += 1;
    }
    const roll = random() * 100;
    if (roll < raw.success) star += 1;
    else if (roll < raw.success + raw.stay) {
      // 유지
    } else if (roll < raw.success + raw.stay + raw.drop) {
      if (!options.protectDrop) {
        star = Math.max(0, star - 1);
        drops += 1;
      }
    } else if (!options.protectDestroy) {
      destroyed = true;
      break;
    }
  }
  return { star, tries, destroyed, drops, dropProtections, destroyProtections };
}

/**
 * 문장 강화 총 기대 비용: Lv.1 구매가 + 목표 레벨까지 단계마다 (메소 + 증표 × 시세) ÷ 성공 확률.
 * @param {{ markPriceMan: number, krwPerEok: number, lv1PriceEok: number, targetLevel: number }} input
 */
export function emblemCost(rules, { markPriceMan, krwPerEok, lv1PriceEok, targetLevel }) {
  const steps = rules.emblem.steps.map((step) => {
    const attempts = 1 / step.probability;
    const marks = step.marks * attempts;
    const cost = step.meso * attempts + marks * markPriceMan * 10000;
    return { level: step.level, probability: step.probability, marks, cost, counted: step.level < targetLevel };
  });
  const enhance = steps.filter((step) => step.counted).reduce((sum, step) => sum + step.cost, 0);
  const total = lv1PriceEok * 1e8 + enhance;
  return { steps, enhance, total, cash: Math.round((total / 1e8) * krwPerEok) };
}

/**
 * 장신구 연마: 단계마다 1회 비용(MVP 할인), 기대 메소·재료, 누적.
 * @param {"other" | "badge" | "belt"} track @param {number} discount 0~1
 */
export function polishTable(rules, track, discount = 0) {
  const data = rules.polish.tracks[track];
  let mesoSum = 0;
  let materialSum = 0;
  return data.probability.map((probability, index) => {
    const cost = Math.floor(data.meso[index] * (1 - discount));
    const meso = cost / probability;
    const material = data.materialPerTry[index] / probability;
    mesoSum += meso;
    materialSum += material;
    return { level: index + 1, probability, cost, meso, material, materialPerTry: data.materialPerTry[index], mesoSum, materialSum };
  });
}

/**
 * 장신구 연마 한 번 돌려 보기: Lv.from → Lv.to 까지 성공할 때까지 시도(실패해도 단계 유지).
 * @returns {{ tries: number, material: number, meso: number }}
 */
export function simulatePolish(rules, track, from, to, discount = 0, random = Math.random) {
  const data = rules.polish.tracks[track];
  let tries = 0;
  let material = 0;
  let meso = 0;
  for (let level = from; level < to; ) {
    tries += 1;
    material += data.materialPerTry[level];
    meso += Math.floor(data.meso[level] * (1 - discount));
    if (random() < data.probability[level]) level += 1;
  }
  return { tries, material, meso };
}

/**
 * 내 운: 같은 목표를 samples 번 돌려 재료를 내 재료 이하로 쓴 비율(작을수록 운이 좋다 = 상위 %).
 * @returns {number} 0~1
 */
export function polishLuck(rules, track, from, to, material, samples = 2000, random = Math.random) {
  let atMost = 0;
  for (let index = 0; index < samples; index += 1) if (simulatePolish(rules, track, from, to, 0, random).material <= material) atMost += 1;
  return atMost / samples;
}

/**
 * 장비 전수: 켠 항목마다 점수 → 주문서 ceil(점수 × 배율)을 더하고, 메소 = 점수 합 × 점수당 메소.
 * @param {{ receiver: string, starforce: number | null, potential: [string, number] | null, additionalPotential: [string, number] | null, additional: [string, number] | null, greatSoul: boolean }} input
 *   [등급, 줄 수], 끈 항목은 null
 */
export function transferCost(rules, { receiver, starforce, potential, additionalPotential, additional, greatSoul }) {
  const table = rules.transfer;
  const rate = table.receivers[receiver];
  const points = table.points;
  const items = [];
  if (starforce !== null && starforce > 0) items.push({ key: "starforce", label: `스타포스 ${starforce}성`, points: starforce * points.starforcePerStar });
  if (additional) items.push({ key: "additional", label: `추가 옵션 ${additional[0]} ${additional[1]}줄`, points: points.additional[additional[0]]?.[additional[1]] ?? 0 });
  if (potential) items.push({ key: "potential", label: `잠재능력 ${potential[0]} ${potential[1]}줄`, points: points.potential[potential[0]]?.[potential[1]] ?? 0 });
  if (additionalPotential) items.push({ key: "additionalPotential", label: `에디셔널 ${additionalPotential[0]} ${additionalPotential[1]}줄`, points: points.additionalPotential[additionalPotential[0]]?.[additionalPotential[1]] ?? 0 });
  if (greatSoul) items.push({ key: "greatSoul", label: "위대한 소울", points: points.greatSoul });
  const rows = items.map((item) => ({ ...item, scrolls: Math.ceil(item.points * rate.scrollsPerPoint), meso: item.points * rate.mesoPerPoint }));
  return {
    rows,
    scrolls: rows.reduce((sum, row) => sum + row.scrolls, 0),
    meso: rows.reduce((sum, row) => sum + row.meso, 0)
  };
}

/**
 * 길드 어빌리티 정산: 스킬마다 현재 → 목표 EXP, 활성석(스킬마다 올림), 1인당(올림)·GP, 목표 효과 합.
 * @param {Record<string, { current: number, target: number }>} levels 키 "차수|스킬 이름"
 */
export function guildAbilityCost(rules, levels, members) {
  const table = rules.guildAbility;
  const people = Math.max(1, Math.floor(members) || 1);
  let exp = 0;
  let gold = 0;
  let black = 0;
  /** @type {Map<string, { value: number, unit: string }>} */
  const buffs = new Map();
  for (const tier of table.tiers) {
    const useGold = table.stones.gold.tiers.includes(tier.tier);
    for (const skill of tier.skills) {
      const key = `${tier.tier}|${skill.name}`;
      const max = skill.exp.length + 1;
      const current = Math.min(max, Math.max(1, levels[key]?.current ?? 1));
      const target = Math.min(max, Math.max(current, levels[key]?.target ?? current));
      const need = skill.exp.slice(current - 1, target - 1).reduce((sum, value) => sum + value, 0);
      exp += need;
      if (useGold) gold += Math.ceil(need / table.stones.gold.exp);
      else black += Math.ceil(need / table.stones.black.exp);
      const text = String(skill.values[target - 1] || "");
      const match = /([+-]?\d+(?:\.\d+)?)\s*(만|%|초|개)?/.exec(text);
      if (match) {
        const prev = buffs.get(skill.stat) || { value: 0, unit: match[2] || "" };
        buffs.set(skill.stat, { value: prev.value + Number(match[1]), unit: prev.unit || match[2] || "" });
      }
    }
  }
  const goldPer = Math.ceil(gold / people);
  const blackPer = Math.ceil(black / people);
  const gpPer = goldPer * table.stones.gold.gp + blackPer * table.stones.black.gp;
  return { exp, gold, black, goldPer, blackPer, gpPer, gpTotal: gpPer * people, buffs: [...buffs.entries()].map(([stat, value]) => ({ stat, ...value })) };
}
