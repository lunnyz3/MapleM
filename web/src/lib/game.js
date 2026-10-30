// 게임 기준 데이터(월드·랭킹 종류)와 기존 화면 주소.
import { formatComma, formatKoreanUnits } from "./format.js";

/** 넥슨 API 한글 월드명. 순서는 기존 화면과 같다. */
export const WORLDS = Object.freeze(["스카니아", "루나", "제니스", "크로아", "유니온", "엘리시움", "아케인"]);
export const DEFAULT_WORLD = WORLDS[0];

/** 넥슨 랭킹은 2025-11-27 데이터부터 있다. */
export const RANKING_DATE_FLOOR = "2025-11-27";

/**
 * @typedef {"character" | "guild"} SearchKind
 * @typedef {"sky" | "mint" | "lavender" | "peach" | "gold"} Tone
 *
 * @typedef {Object} RankingValue
 * @property {string} text      화면 표기(예: "11억 5,390만")
 * @property {string} [prefix]  값 앞 단위(예: "Lv.")
 * @property {string} [unit]    값 뒤 단위(예: "층")
 * @property {string} full      전체 값(마우스 오버)
 *
 * @typedef {Object} RankingType
 * @property {string} id        API 경로(/api/maplestorym/ranking/<id>)
 * @property {string} label     전체 이름(예: 종합 랭킹)
 * @property {string} name      바로가기 이름(예: 종합)
 * @property {string} short     탭 이름
 * @property {string} icon
 * @property {Tone} tone
 * @property {SearchKind} subject
 * @property {string} metric    값 이름
 * @property {(row: Record<string, any>) => RankingValue} value
 * @property {(row: Record<string, any>) => string[]} meta   이름 아래 보조 글자(월드·등급 글자는 넣지 않는다)
 * @property {(row: Record<string, any>) => { src: string, label: string }} [grade]  등급 아이콘
 * @property {string} field     핵심 값 필드(카운트업용)
 * @property {boolean} [big]    큰 수(한국식 단위)
 * @property {boolean} [noRankChange] 순위 변동(▲▼)을 보이지 않음(4주 시즌인 샤레니안의 전장)
 */

/** 월드 → 아이콘(public/assets) */
const WORLD_ICON_FILES = {
  스카니아: "scania",
  루나: "luna",
  제니스: "zenith",
  크로아: "croa",
  유니온: "union",
  엘리시움: "elysium",
  아케인: "arcane"
};

/** @param {string} world */
export function worldIconSrc(world) {
  const file = WORLD_ICON_FILES[/** @type {keyof typeof WORLD_ICON_FILES} */ (String(world || "").trim())];
  return file ? `/assets/${file}.png` : "";
}

/**
 * 등급 이름("마스터", "그랜드마스터 3", "슈프림 V") → 기본 등급 아이콘. API 아이콘이 없을 때만 쓴다.
 * @param {string} name
 */
export function gradeFallbackIcon(name) {
  const text = String(name || "").replace(/\s+/g, "").toLowerCase();
  if (!text) return "";
  const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
  const digit = text.match(/([1-5])$/);
  const romanMatch = text.match(/(iv|v|i{1,3})$/);
  const level = digit ? Number(digit[1]) : romanMatch ? roman[/** @type {keyof typeof roman} */ (romanMatch[1])] : 1;
  const key = text.includes("슈프림") || text.includes("supreme")
    ? "supreme"
    : text.includes("그랜드") || text.includes("grandmaster")
      ? "grandmaster"
      : text.includes("마스터") || text.includes("master")
        ? "master"
        : text.includes("베테랑") || text.includes("veteran")
          ? "veteran"
          : text.includes("노비스") || text.includes("nobis") || text.includes("novice")
            ? "nobis"
            : "";
  return key ? `/assets/ico-${key}${level}.png` : "";
}

/** @param {unknown} v @param {string} [unit] @param {string} [prefix] @returns {RankingValue} */
const plain = (v, unit, prefix) => ({ text: formatComma(v), unit, prefix, full: `${prefix || ""}${formatComma(v)}${unit || ""}` });
/** @param {unknown} v @param {string} [unit] @returns {RankingValue} */
const korean = (v, unit) => ({ text: formatKoreanUnits(v), unit, full: `${formatComma(v)}${unit || ""}` });
/** @param {...unknown} parts */
const compact = (...parts) => parts.map((part) => String(part ?? "").trim()).filter(Boolean);
/** @param {Record<string, any>} row */
const levelText = (row) => (row.character_level ? `Lv.${row.character_level}` : "");

/**
 * 랭킹 종류. 화면(탭·바로가기·미리보기)은 이 순서를 그대로 따른다.
 * meta 에는 월드·등급 글자를 넣지 않는다(월드는 아이콘, 등급은 grade 아이콘으로 보여준다).
 * @type {RankingType[]}
 */
export const RANKING_TYPES = [
  {
    id: "level",
    label: "종합 랭킹",
    name: "종합",
    short: "종합",
    icon: "crown",
    tone: "gold",
    subject: "character",
    metric: "레벨",
    value: (row) => plain(row.character_level, "", "Lv."),
    meta: (row) => compact(row.character_class, row.guild_name),
    field: "character_level"
  },
  {
    id: "combat-power",
    label: "전투력 랭킹",
    name: "전투력",
    short: "전투력",
    icon: "bolt",
    tone: "peach",
    subject: "character",
    metric: "전투력",
    value: (row) => korean(row.character_combat_power),
    meta: (row) => compact(row.character_class, levelText(row)),
    field: "character_combat_power",
    big: true
  },
  {
    id: "sharenian-waterway",
    label: "샤레니안의 지하수로",
    name: "샤레니안의 지하수로",
    short: "지하수로",
    icon: "waterway",
    tone: "mint",
    subject: "guild",
    metric: "시즌 점수",
    value: (row) => korean(row.season_score, "점"),
    meta: (row) => compact(row.guild_master_name),
    grade: (row) => ({ src: row.grade_icon || "", label: "" }),
    field: "season_score",
    big: true
  },
  {
    id: "union",
    label: "유니온 랭킹",
    name: "유니온",
    short: "유니온",
    icon: "union",
    tone: "sky",
    subject: "character",
    metric: "유니온 레벨",
    value: (row) => plain(row.union_level, "", "Lv."),
    meta: (row) => compact(row.character_class),
    grade: (row) => ({ src: row.union_grade_icon || "", label: String(row.union_grade || "") }),
    field: "union_level"
  },
  {
    id: "achievement",
    label: "업적 랭킹",
    name: "업적",
    short: "업적",
    icon: "medal",
    tone: "lavender",
    subject: "character",
    metric: "업적 점수",
    value: (row) => plain(row.achievement_score, "점"),
    meta: (row) => compact(row.character_class),
    grade: (row) => ({ src: row.achievement_grade_icon || "", label: String(row.achievement_grade_name || "") }),
    field: "achievement_score"
  },
  {
    id: "root-of-time",
    label: "시간의 근원",
    name: "시간의 근원",
    short: "시간의 근원",
    icon: "hourglass",
    tone: "lavender",
    subject: "character",
    metric: "최대 피해량",
    value: (row) => korean(row.max_damage),
    meta: (row) => compact(row.character_class, levelText(row)),
    field: "max_damage",
    big: true
  },
  {
    id: "sharenian-battlefield",
    label: "샤레니안의 전장",
    name: "샤레니안의 전장",
    short: "전장",
    icon: "swords",
    tone: "peach",
    subject: "guild",
    metric: "시즌 점수",
    value: (row) => korean(row.season_score, "점"),
    meta: (row) => compact(row.guild_master_name),
    grade: (row) => ({ src: row.grade_icon || "", label: "" }),
    field: "season_score",
    big: true,
    noRankChange: true
  }
];

/** @param {string} id */
export function getRankingType(id) {
  return RANKING_TYPES.find((type) => type.id === id) || RANKING_TYPES[0];
}

/** 화면 주소. 기존 화면은 /legacy 첫 화면만 남아 있다. */
/** 계산기 화면 목록(계산기 탭과 상단 메뉴가 같이 쓴다). 해방이 첫 화면. */
/** 오락실 게임(/game?mode=): 상단·전체 메뉴와 오락실 화면이 같은 이름을 쓴다. */
export const GAME_MODES = [
  { value: "fortune", label: "오늘의 운세" },
  { value: "match", label: "캐릭터 궁합" },
  { value: "nick", label: "닉네임 생성기" },
  { value: "cup", label: "장비창 월드컵" },
  { value: "vs", label: "누가 더 셀까?" },
  { value: "guess", label: "전투력 맞히기" },
  { value: "reaction", label: "레전더리 반응속도" },
  { value: "star", label: "스타캐치" },
  { value: "sf", label: "스타포스 도전" },
  { value: "merge", label: "장비 합성" },
  { value: "memory", label: "짝 맞추기" },
  { value: "simon", label: "등급 순서 기억" },
  { value: "quiz", label: "아이템 이름 맞히기" },
  { value: "typing", label: "장비 이름 타자" },
  { value: "catch", label: "아이템 줍기" }
];

export const CALC_VIEWS = [
  { value: "liberation", label: "해방" },
  { value: "hexa", label: "HEXA 강화" },
  { value: "stat", label: "HEXA 스탯" },
  { value: "symbol", label: "심볼" },
  { value: "starforce", label: "스타포스" },
  { value: "set", label: "세트 효과" },
  { value: "emblem", label: "문장" },
  { value: "polish", label: "장신구 연마" },
  { value: "transfer", label: "전수" },
  { value: "guild", label: "길드 어빌리티" },
  { value: "gacha", label: "확률" },
  { value: "itemdb", label: "아이템 DB" },
  { value: "party", label: "보스 파티" }
];

export const urls = {
  /** @param {string} world @param {string} name */
  character: (world, name) => `/character/${encodeURIComponent(world)}/${encodeURIComponent(name)}`,
  /** @param {string} world @param {string} name */
  guild: (world, name) => `/guild/${encodeURIComponent(world)}/${encodeURIComponent(name)}`,
  /** @param {string} type @param {Record<string, string | number>} [params] */
  ranking: (type, params = {}) => {
    const query = new URLSearchParams({ type });
    for (const [key, value] of Object.entries(params)) if (value !== "" && value !== undefined) query.set(key, String(value));
    return `/ranking?${query}`;
  },
  guildSearch: "/guild",
  calc: "/calc",
  stats: "/stats",
  hall: "/ranking?view=hall",
  itemSearch: "/ranking?view=search",
  game: "/game",
  news: "/news",
  my: "/my",
  /** @param {string} [world] @param {string} [name] 왼쪽에 넣어 둘 캐릭터 */
  compare: (world = "", name = "") => (world && name ? `/compare?${new URLSearchParams({ a: `${world}/${name}` })}` : "/compare"),
  legacyHome: "/legacy",
  bot: "/bot",
  home: "/",
  design: "/design",
  licenses: "/licenses"
};

/**
 * @param {SearchKind} kind
 * @param {string} world
 * @param {string} name
 */
export function detailUrl(kind, world, name) {
  return kind === "guild" ? urls.guild(world, name) : urls.character(world, name);
}
