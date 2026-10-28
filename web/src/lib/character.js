// 캐릭터 상세 화면 도우미: 장비 슬롯 배치·등급, 주요 스탯 표기·출처별 묶기.
import { formatComma, formatDecimal, formatKoreanUnits, toNumber } from "./format.js";

// ======================= 장비 =======================

/**
 * 슬롯 이름 → 배치 키. 기존 화면과 같은 규칙(이름에 든 낱말로 판단).
 * @param {{ slotName?: string, pageName?: string }} item
 */
export function slotKey(item) {
  const text = `${item?.slotName || ""} ${item?.pageName || ""}`.replace(/\s+/g, "");
  if (text.includes("보조무기")) return "subWeapon";
  if (text.includes("엠블렘")) return "emblem";
  if (text.includes("무기")) return "weapon";
  if (text.includes("모자")) return "hat";
  if (text.includes("한벌")) return "overall";
  if (text.includes("장갑")) return "gloves";
  if (text.includes("신발")) return "shoes";
  if (text.includes("어깨") || text.includes("숄더")) return "shoulder";
  if (text.includes("망토")) return "cape";
  if (text.includes("벨트")) return "belt";
  if (text.includes("목걸이") || text.includes("펜던")) return text.includes("2번째") ? "necklace2" : "necklace1";
  if (text.includes("반지")) {
    if (text.includes("4번째")) return "ring4";
    if (text.includes("3번째")) return "ring3";
    if (text.includes("2번째")) return "ring2";
    return "ring1";
  }
  if (text.includes("귀고리") || text.includes("귀걸")) return "earring";
  if (text.includes("포켓")) return "pocket";
  if (text.includes("얼굴장식")) return "face";
  if (text.includes("눈장식")) return "eye";
  if (text.includes("뱃지")) return "badge";
  if (text.includes("칭호")) return "title";
  if (text.includes("훈장")) return "medal";
  return "";
}

/**
 * 장비창 배치(6열 × 5줄, 가운데 2열 × 3줄은 캐릭터 그림). [키, 이름, 열, 줄]
 * @type {Array<[string, string, number, number]>}
 */
export const SLOT_LAYOUT = [
  ["ring1", "반지", 1, 1],
  ["necklace1", "목걸이", 2, 1],
  ["hat", "모자", 3, 1],
  ["face", "얼굴장식", 4, 1],
  ["eye", "눈장식", 5, 1],
  ["emblem", "엠블렘", 6, 1],
  ["ring2", "반지 2", 1, 2],
  ["necklace2", "목걸이 2", 2, 2],
  ["shoulder", "어깨", 5, 2],
  ["badge", "뱃지", 6, 2],
  ["ring3", "반지 3", 1, 3],
  ["earring", "귀고리", 2, 3],
  ["overall", "한벌옷", 5, 3],
  ["medal", "훈장", 6, 3],
  ["ring4", "반지 4", 1, 4],
  ["belt", "벨트", 2, 4],
  ["gloves", "장갑", 5, 4],
  ["title", "칭호", 6, 4],
  ["pocket", "포켓", 1, 5],
  ["cape", "망토", 2, 5],
  ["weapon", "무기", 3, 5],
  ["subWeapon", "보조무기", 4, 5],
  ["shoes", "신발", 5, 5]
];

/** 등급 → 색 계열·글자 (design-system 2.3: 레어 sky / 에픽 lavender / 유니크 gold / 레전더리 mint) */
const GRADES = {
  rare: { label: "레어", letter: "R", tone: "sky" },
  epic: { label: "에픽", letter: "E", tone: "lavender" },
  unique: { label: "유니크", letter: "U", tone: "gold" },
  legendary: { label: "레전더리", letter: "L", tone: "mint" }
};

/**
 * 등급 글자("레전더리") 또는 숫자("4") → 등급 정보. 모르면 null.
 * @param {unknown} value
 */
export function gradeInfo(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "4" || text.includes("레전") || text.includes("legend")) return GRADES.legendary;
  if (text === "3" || text.includes("유니크") || text.includes("unique")) return GRADES.unique;
  if (text === "2" || text.includes("에픽") || text.includes("epic")) return GRADES.epic;
  if (text === "1" || text.includes("레어") || text.includes("rare")) return GRADES.rare;
  return null;
}

/**
 * 잠재 등급(옵션이 있을 때만).
 * @param {any[]} options @param {unknown} grade
 */
export function potentialInfo(options, grade) {
  return Array.isArray(options) && options.length ? gradeInfo(grade) : null;
}

/** @param {unknown} value */
export function starforce(value) {
  const number = toNumber(value);
  return number !== null && number > 0 ? Math.round(number) : null;
}

/**
 * 프리셋 목록에서 번호로 찾기.
 * @param {any} tab @param {number | null | undefined} no
 */
export function presetByNo(tab, no) {
  const presets = Array.isArray(tab?.presets) ? tab.presets : [];
  return presets.find((preset) => preset.presetNo === no) || presets.find((preset) => preset.isActive) || presets[0] || null;
}

/** @param {any} tab */
export function presetNumbers(tab) {
  return (Array.isArray(tab?.presets) ? tab.presets : []).map((preset) => preset.presetNo).sort((a, b) => a - b);
}

// ======================= 주요 스탯 =======================

const FLAT_KEYS = new Set(["physicalAttack", "magicalAttack", "maxDamage"]);

/** @param {string} key */
export const isFlatStat = (key) => FLAT_KEYS.has(key);

/** @param {string} key */
const digitsOf = (key) => (key === "ignoreDefense" ? 3 : 2);

/**
 * 주요 스탯 값 표기. 억 이상 정수는 한국식 단위, 나머지는 쉼표, 비율은 %.
 * @param {string} key @param {number} value
 */
export function formatStat(key, value) {
  if (!Number.isFinite(value)) return "-";
  if (FLAT_KEYS.has(key)) return Math.abs(value) >= 1e8 ? formatKoreanUnits(value) : formatComma(value);
  return `${formatDecimal(value, digitsOf(key))}%`;
}

/**
 * 더하기 표기(+86,925 / +12.5%).
 * @param {string} key @param {number} value
 */
export function formatStatDelta(key, value) {
  if (!Number.isFinite(value)) return "-";
  const sign = value < 0 ? "-" : "+";
  const abs = Math.abs(value);
  if (FLAT_KEYS.has(key)) return `${sign}${abs >= 1e8 ? formatKoreanUnits(abs) : formatComma(abs)}`;
  return `${sign}${formatDecimal(abs, digitsOf(key))}%`;
}

/** 출처 분류 순서와 색 */
export const CATEGORY_META = {
  equipment: { label: "장비", tone: "sky", order: 0 },
  skill: { label: "스킬", tone: "lavender", order: 1 },
  growth: { label: "성장", tone: "mint", order: 2 },
  content: { label: "콘텐츠", tone: "gold", order: 3 },
  manual: { label: "직접 입력", tone: "peach", order: 4 }
};

/**
 * @typedef {{ key: string, label: string, value: number, items: any[] }} BreakdownGroup
 * @typedef {{ key: string, label: string, tone: string, value: number, groups: BreakdownGroup[] }} BreakdownCategory
 */

/**
 * 출처 내역 → 분류 → 그룹 → 항목.
 * @param {any[]} breakdown
 * @returns {BreakdownCategory[]}
 */
export function groupBreakdown(breakdown) {
  /** @type {Map<string, BreakdownCategory & { groupMap: Map<string, BreakdownGroup> }>} */
  const categories = new Map();
  for (const entry of Array.isArray(breakdown) ? breakdown : []) {
    const key = String(entry?.category || "etc");
    const meta = CATEGORY_META[/** @type {keyof typeof CATEGORY_META} */ (key)];
    if (!categories.has(key)) {
      categories.set(key, { key, label: entry?.categoryLabel || meta?.label || "기타", tone: meta?.tone || "sky", value: 0, groups: [], groupMap: new Map() });
    }
    const category = /** @type {any} */ (categories.get(key));
    const groupKey = String(entry?.group || entry?.groupLabel || "etc");
    if (!category.groupMap.has(groupKey)) {
      const group = { key: groupKey, label: entry?.groupLabel || "기타", value: 0, items: [] };
      category.groupMap.set(groupKey, group);
      category.groups.push(group);
    }
    const group = category.groupMap.get(groupKey);
    const value = Number(entry?.value) || 0;
    category.value += value;
    group.value += value;
    group.items.push(entry);
  }
  const orderOf = (key) => CATEGORY_META[/** @type {keyof typeof CATEGORY_META} */ (key)]?.order ?? 9;
  return [...categories.values()]
    .sort((a, b) => orderOf(a.key) - orderOf(b.key))
    .map(({ groupMap, ...category }) => ({ ...category, groups: category.groups.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)) }));
}

/** 공격 방식에 맞는 기본 순서(서버가 majorStatOrder 를 주지 않을 때) */
export function statOrder(profile) {
  if (Array.isArray(profile?.majorStatOrder) && profile.majorStatOrder.length) return profile.majorStatOrder;
  const magic = profile?.attackType === "magical";
  return [
    magic ? "magicalAttack" : "physicalAttack",
    magic ? "magicalAttackPercent" : "physicalAttackPercent",
    magic ? "magicalDamagePercent" : "physicalDamagePercent",
    "bossDamage",
    "criticalDamage",
    "finalDamage",
    "maxDamage",
    "ignoreDefense"
  ];
}

/**
 * "아케인심볼 : 소멸의 여로" → "소멸의 여로"
 * @param {string} name
 */
export const shortSymbolName = (name) => String(name || "").replace(/^.*?:\s*/, "");
