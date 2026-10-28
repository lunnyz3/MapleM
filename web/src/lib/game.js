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
 * @property {string} desc      바로가기 설명
 * @property {SearchKind} subject
 * @property {string} metric    값 이름
 * @property {(row: Record<string, any>) => RankingValue} value
 * @property {(row: Record<string, any>) => string[]} meta
 */

/** @param {unknown} v @param {string} [unit] @param {string} [prefix] @returns {RankingValue} */
const plain = (v, unit, prefix) => ({ text: formatComma(v), unit, prefix, full: `${prefix || ""}${formatComma(v)}${unit || ""}` });
/** @param {unknown} v @param {string} [unit] @returns {RankingValue} */
const korean = (v, unit) => ({ text: formatKoreanUnits(v), unit, full: `${formatComma(v)}${unit || ""}` });
/** @param {...unknown} parts */
const compact = (...parts) => parts.map((part) => String(part ?? "").trim()).filter(Boolean);
/** @param {Record<string, any>} row */
const levelText = (row) => (row.character_level ? `Lv.${row.character_level}` : "");

/** @type {RankingType[]} */
export const RANKING_TYPES = [
  {
    id: "level",
    label: "종합 랭킹",
    name: "종합",
    short: "종합",
    icon: "crown",
    tone: "gold",
    desc: "레벨 순위",
    subject: "character",
    metric: "레벨",
    value: (row) => plain(row.character_level, "", "Lv."),
    meta: (row) => compact(row.character_class, row.world_name, row.guild_name && `${row.guild_name} 길드`)
  },
  {
    id: "union",
    label: "유니온 랭킹",
    name: "유니온",
    short: "유니온",
    icon: "union",
    tone: "sky",
    desc: "유니온 레벨",
    subject: "character",
    metric: "유니온 레벨",
    value: (row) => plain(row.union_level, "", "Lv."),
    meta: (row) => compact(row.character_class, row.world_name, row.union_grade)
  },
  {
    id: "achievement",
    label: "업적 랭킹",
    name: "업적",
    short: "업적",
    icon: "medal",
    tone: "lavender",
    desc: "업적 점수",
    subject: "character",
    metric: "업적 점수",
    value: (row) => plain(row.achievement_score, "점"),
    meta: (row) => compact(row.world_name, row.achievement_grade_name)
  },
  {
    id: "sharenian-battlefield",
    label: "샤레니안의 전장",
    name: "샤레니안의 전장",
    short: "전장",
    icon: "swords",
    tone: "peach",
    desc: "길드 시즌 점수",
    subject: "guild",
    metric: "시즌 점수",
    value: (row) => korean(row.season_score, "점"),
    meta: (row) => compact(row.guild_master_name && `마스터 ${row.guild_master_name}`, row.world_name)
  },
  {
    id: "sharenian-waterway",
    label: "샤레니안의 지하수로",
    name: "샤레니안의 지하수로",
    short: "지하수로",
    icon: "waterway",
    tone: "mint",
    desc: "길드 시즌 점수",
    subject: "guild",
    metric: "시즌 점수",
    value: (row) => korean(row.season_score, "점"),
    meta: (row) => compact(row.guild_master_name && `마스터 ${row.guild_master_name}`, row.world_name)
  },
  {
    id: "root-of-time",
    label: "시간의 근원",
    name: "시간의 근원",
    short: "시간의 근원",
    icon: "hourglass",
    tone: "lavender",
    desc: "최대 피해량",
    subject: "character",
    metric: "최대 피해량",
    value: (row) => korean(row.max_damage),
    meta: (row) => compact(row.character_class, row.world_name, levelText(row))
  },
  {
    id: "combat-power",
    label: "전투력 랭킹",
    name: "전투력",
    short: "전투력",
    icon: "bolt",
    tone: "peach",
    desc: "공식 전투력",
    subject: "character",
    metric: "전투력",
    value: (row) => korean(row.character_combat_power),
    meta: (row) => compact(row.character_class, row.world_name, levelText(row))
  },
  {
    id: "dojang",
    label: "무릉도장",
    name: "무릉도장",
    short: "무릉도장",
    icon: "gate",
    tone: "mint",
    desc: "최고 층수",
    subject: "character",
    metric: "최고 층수",
    value: (row) => plain(row.dojang_floor, "층"),
    meta: (row) => compact(row.character_class, row.world_name, levelText(row))
  },
  {
    id: "kerning-m-tower",
    label: "커닝M타워",
    name: "커닝M타워",
    short: "커닝M타워",
    icon: "tower",
    tone: "sky",
    desc: "최고 층수",
    subject: "character",
    metric: "최고 층수",
    value: (row) => plain(row.tower_floor, "층"),
    meta: (row) => compact(row.character_class, row.world_name, levelText(row))
  }
];

/** @param {string} id */
export function getRankingType(id) {
  return RANKING_TYPES.find((type) => type.id === id) || RANKING_TYPES[0];
}

/** 화면 주소. 캐릭터·랭킹은 새 화면(/preview/…), 길드는 아직 기존 화면. */
export const urls = {
  /** @param {string} world @param {string} name */
  character: (world, name) => `/preview/character/${encodeURIComponent(world)}/${encodeURIComponent(name)}`,
  /** @param {string} world @param {string} name */
  legacyCharacter: (world, name) => `/character/${encodeURIComponent(world)}/${encodeURIComponent(name)}`,
  /** @param {string} world @param {string} name */
  guild: (world, name) => `/guild/${encodeURIComponent(world)}/${encodeURIComponent(name)}`,
  /** @param {string} type @param {Record<string, string | number>} [params] */
  ranking: (type, params = {}) => {
    const query = new URLSearchParams({ type });
    for (const [key, value] of Object.entries(params)) if (value !== "" && value !== undefined) query.set(key, String(value));
    return `/preview/ranking?${query}`;
  },
  /** @param {string} type */
  legacyRanking: (type) => `/ranking.html?type=${encodeURIComponent(type)}`,
  guildSearch: "/guild",
  legacyHome: "/",
  home: "/preview/",
  licenses: "/preview/licenses"
};

/**
 * @param {SearchKind} kind
 * @param {string} world
 * @param {string} name
 */
export function detailUrl(kind, world, name) {
  return kind === "guild" ? urls.guild(world, name) : urls.character(world, name);
}
