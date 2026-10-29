// 문장·소울 바꿔 보기(순수 함수): src/game-data/soul-emblem.json 표로 고를 수 있는 옵션 줄을 만든다.

/** 문장 종류 목록(스탯 이름 포함). */
export function emblemKinds(table) {
  return Object.entries(table.emblem.statByEmblem).map(([name, stat]) => ({ name, stat }));
}

/** 문장 종류·레벨 → 옵션 줄. @returns {Array<{ name: string, value: string }>} */
export function emblemLines(table, kind, level) {
  const index = Math.max(1, Math.min(table.emblem.maxDamageByLevel.length, level)) - 1;
  const stat = table.emblem.statByEmblem[kind];
  return [
    { name: "최대 대미지", value: String(table.emblem.maxDamageByLevel[index]) },
    ...(stat ? [{ name: stat, value: `${table.emblem.percentByLevel[index]}%` }] : [])
  ];
}

/**
 * 소울 후보: 보스마다 고를 수 있는 옵션 줄. 무기는 기준값 그대로(최종·보공·대미지·치피) + 최대 대미지,
 * 보조 장비는 최종 대미지 × 0.3 + 최대 대미지. 하나만 있는 소울(fixed)은 그 줄만.
 * @param {any} table @param {boolean} weapon @param {string} attackType
 * @returns {Array<{ boss: string, lines: Array<{ name: string, value: string }> }>}
 */
export function soulChoices(table, weapon, attackType) {
  const damageName = attackType === "magical" ? "마법 대미지" : "물리 대미지";
  const out = [];
  for (const [boss, kinds] of Object.entries(table.soul.bosses)) {
    const row = weapon ? kinds.weapon : kinds.sub;
    if (!row) continue;
    if (row.fixed) {
      out.push({ boss, lines: [{ name: row.fixed.name, value: `${row.fixed.value}%` }] });
      continue;
    }
    const lines = weapon
      ? [
          { name: "최종 대미지", value: `${row.base}%` },
          { name: "보스 공격력", value: `${row.base}%` },
          { name: damageName, value: `${row.base}%` },
          { name: "치명타 피해", value: `${row.base}%` },
          { name: "최대 대미지", value: String(row.weaponMaxDamage) }
        ]
      : [
          { name: "최종 대미지", value: `${Math.round((row.subFinalDamage ?? row.base * table.soul.subFinalFactor) * 100) / 100}%` },
          { name: "최대 대미지", value: String(row.subMaxDamage) }
        ];
    out.push({ boss, lines });
  }
  return out;
}

/** "최종 대미지 4.5%" · "최대 대미지 450,000" → { name, value } */
export function splitLine(text) {
  const match = /^(.*?)\s*([+-]?[\d,.]+%?)\s*$/.exec(String(text || "").trim());
  return match ? { name: match[1].trim(), value: match[2] } : null;
}
