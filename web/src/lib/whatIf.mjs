// 장비 교체 체험(순수 함수): 옵션 줄을 바꿨을 때 보스 세팅 스탯이 어떻게 바뀌는지.
// 옵션 이름 → 효율 계산 키(efficiency.js Totals). 전투력에 안 쓰이는 옵션(방어율 무시·HP·주스탯 …)은 무시한다.

const squash = (text) => String(text || "").replace(/\s+/g, "").replace(/데미지/g, "대미지").replace(/증가$/, "");

/**
 * 옵션 한 줄 → { key, value }. 전투력에 안 쓰이면 null.
 * @param {string} name @param {string | number} valueText @param {string} attackType
 */
export function optionStat(name, valueText, attackType) {
  const option = squash(name);
  const text = String(valueText ?? "");
  const value = Number(text.replace(/[^0-9.\-]/g, ""));
  if (!option || !Number.isFinite(value)) return null;
  const physical = attackType !== "magical";
  const own = physical ? "물리" : "마법";
  const other = physical ? "마법" : "물리";
  if (option.startsWith(other)) return null;
  if (option === `${own}대미지`) return { key: "damage", value };
  if (option === `${own}공격력`) return text.includes("%") ? { key: "attackPercent", value } : { key: "attack", value };
  if (option === "보스공격력") return { key: "boss", value };
  if (option === "최종대미지") return { key: "finalDamage", value };
  if (option === "치명타피해" || option === "크리티컬대미지") return { key: "critical", value };
  if (option === "최대대미지") return { key: "maxDamage", value };
  return null;
}

/**
 * 원래 줄들과 바꾼 줄들의 차이를 스탯에 반영한 새 합계.
 * @param {Record<string, number>} totals
 * @param {Array<{ name: string, value: string }>} before @param {Array<{ name: string, value: string }>} after
 * @param {string} attackType
 */
export function applyLineChanges(totals, before, after, attackType) {
  const next = { ...totals };
  const add = (/** @type {{ name: string, value: string }} */ line, sign) => {
    const stat = optionStat(line?.name, line?.value, attackType);
    if (stat) next[stat.key] = (next[stat.key] || 0) + sign * stat.value;
  };
  before.forEach((line) => add(line, -1));
  after.forEach((line) => add(line, 1));
  return next;
}
