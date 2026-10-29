// 실전 딜 모델(순수 함수): 공개 계산 도구의 스탯 효율 "대미지 모드"를 옮겼다.
// 딜 = 깡공 × (공격력% + 스킬 퍼뎀 400% × (1 + 보공)) × (1 + 대미지) × (1.2 + 치피) × (1 + 최종) × (1 − 보스 방어율 × (1 − 방무))
// 방무는 곱으로 더해진다: 방무' = 1 − (1 − 방무)(1 − 추가). 최대 대미지는 넣지 않는다. 도핑은 이 모드에서만 더한다.

export const SKILL_PERCENT = 400;
export const DEFAULT_BOSS_DEFENSE = 77.89;

/** 도핑(%p). 5종·맥피가 기본. */
export const DOPING = [
  { key: "five", name: "5종", stats: { attackPercent: 30, boss: 30, damage: 30, critical: 30 } },
  { key: "maxFever", name: "맥피", stats: { attackPercent: 50, critical: 50 } },
  { key: "fever", name: "일피", stats: { attackPercent: 25, critical: 25 } },
  { key: "tangtang", name: "탕탕", stats: { boss: 20, damage: 20 } },
  { key: "bossKiller", name: "보킬", stats: { boss: 50 } },
  { key: "advancedBossKiller", name: "고보킬", stats: { boss: 100 } },
  { key: "mvp", name: "MVP", stats: { attackPercent: 30 } },
  { key: "guildSkill", name: "길스", stats: { damage: 10 } },
  { key: "union", name: "유니온", stats: { attackPercent: 30 } },
  { key: "cooking", name: "요리", stats: { critical: 5, boss: 10 } }
];
export const DEFAULT_DOPING = ["five", "maxFever"];

/** 도핑을 더한 합계. @param {Record<string, number>} t @param {string[]} keys */
export function withDoping(t, keys) {
  const next = { ...t };
  for (const key of keys) {
    const doping = DOPING.find((item) => item.key === key);
    for (const [stat, value] of Object.entries(doping?.stats || {})) next[stat] = (next[stat] || 0) + value;
  }
  return next;
}

/** 실전 딜(상댓값). @param {Record<string, number>} t @param {number} bossDefense % */
export function damageScore(t, bossDefense = DEFAULT_BOSS_DEFENSE) {
  const ied = Math.min(100, Math.max(0, t.ignoreDefense || 0)) / 100;
  return (
    Math.max(t.attack, 1) *
    ((t.attackPercent || 0) / 100 + (SKILL_PERCENT / 100) * (1 + (t.boss || 0) / 100)) *
    (1 + (t.damage || 0) / 100) *
    (1.2 + (t.critical || 0) / 100) *
    (1 + (t.finalDamage || 0) / 100) *
    Math.max(0, 1 - (bossDefense / 100) * (1 - ied))
  );
}

/** 한 스탯을 amount 올린 합계(방무는 곱으로). */
export function raise(t, id, amount) {
  if (id === "ignoreDefense") {
    const ied = Math.min(100, Math.max(0, t.ignoreDefense || 0)) / 100;
    return { ...t, ignoreDefense: (1 - (1 - ied) * (1 - amount / 100)) * 100 };
  }
  return { ...t, [id]: (t[id] || 0) + amount };
}

/** @returns {{ before: number, after: number, ratio: number }} */
export function damageGain(t, id, amount, bossDefense = DEFAULT_BOSS_DEFENSE) {
  const before = damageScore(t, bossDefense);
  const after = damageScore(raise(t, id, amount), bossDefense);
  return { before, after, ratio: before > 0 ? after / before : 1 };
}

/** 딜을 ratio 배로 만드는 데 필요한 각 스탯의 양(못 닿으면 NaN). */
export function damageAmountForRatio(t, id, ratio, bossDefense = DEFAULT_BOSS_DEFENSE) {
  const r = ratio - 1;
  const term = (t.attackPercent || 0) / 100 + (SKILL_PERCENT / 100) * (1 + (t.boss || 0) / 100);
  switch (id) {
    case "attack":
      return t.attack * r;
    case "attackPercent":
      return term * r * 100;
    case "boss":
      return ((term * r) / (SKILL_PERCENT / 100)) * 100;
    case "damage":
      return (1 + (t.damage || 0) / 100) * r * 100;
    case "critical":
      return (1.2 + (t.critical || 0) / 100) * r * 100;
    case "finalDamage":
      return (1 + (t.finalDamage || 0) / 100) * r * 100;
    case "ignoreDefense": {
      const ied = Math.min(100, Math.max(0, t.ignoreDefense || 0)) / 100;
      const def = bossDefense / 100;
      if (!(def > 0)) return NaN;
      const remain = 1 - def * (1 - ied);
      const needed = 1 - (1 - ratio * remain) / def; // 목표 방무
      if (!(needed < 1) || needed <= ied) return needed <= ied ? 0 : NaN;
      return (1 - (1 - needed) / (1 - ied)) * 100;
    }
    default:
      return NaN;
  }
}
