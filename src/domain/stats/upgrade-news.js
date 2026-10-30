"use strict";

// 오늘의 강화 소식(순수 함수): 날짜별 기록(character_records.journal[].changes)의 장비 변화에서 눈에 띄는 것만 고른다.
//  - star: 같은 장비의 스타포스가 1~5 올랐다(최대 별이면 "달성")
//  - option: 같은 장비·같은 별인데 템환산이 그 칸 최고의 8점(100점 기준) 넘게 올랐다(잠재·에디·추옵을 다시 돌림)
//  - new: 다른 장비(또는 별이 6 넘게 높은 같은 이름의 다른 장비)로 바꿔 템환산이 5점 넘게 올랐다
//    (반지·목걸이는 프리셋마다 칸 순서가 바뀌어 뺀다)
// 무게는 종류를 섞어 늘어놓을 때 쓴다: 최대 별 달성 > 큰 옵션 대박 > 좋은 새 장비 > 그 밖의 별 상승.
// 칭호·훈장은 별도 옵션 재설정도 없어 뺀다.
const scoreMax = require("../../game-data/item-score-max.json");

const ACCESSORIES = new Set(["반지", "목걸이", "귀고리", "눈장식", "얼굴장식", "포켓", "벨트", "뱃지", "엠블렘"]);
const SKIP = new Set(["칭호", "훈장"]);
const SHUFFLED = new Set(["반지", "목걸이"]);
const ARMOR = new Set(["모자", "상의", "하의", "한벌옷", "어깨", "장갑", "신발", "망토"]);
const OPTION_MIN = 8;
const NEW_MIN = 5;

// "반지 (2번째 슬롯)" → "반지"
const groupOf = (slot) => String(slot || "").replace(/\s*\(.*\)\s*$/, "");

/** 그 칸 장비의 가장 높은 별(장신구 10, 벨트 15, 그 밖 35). */
function maxStar(group) {
  if (group === "벨트") return 15;
  return ACCESSORIES.has(group) ? 10 : 35;
}

/** 원점수 → 그 칸 최고 = 100 */
function points(group, score) {
  const max = Number(scoreMax.slots?.[group]?.max) || 0;
  return max > 0 ? (Number(score) / max) * 100 : 0;
}

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * 장비 변화 하나 → 소식(없으면 null).
 * @param {{ slot: string, from: { name: string, starforce: number, score: number } | null, to: { name: string, starforce: number, score: number } | null }} change
 */
function classifyChange(change) {
  const { from, to } = change || {};
  const group = groupOf(change?.slot);
  if (!from || !to || !group || SKIP.has(group)) return null;
  const top = maxStar(group);
  const gain = points(group, to.score) - points(group, from.score);
  const base = { slot: group, item: to.name, fromItem: from.name, fromStar: from.starforce || 0, toStar: to.starforce || 0, gain: round1(gain) };
  const quality = points(group, to.score);
  const jump = base.toStar - base.fromStar;
  if (from.name === to.name && jump > 0 && jump <= 5) {
    const reached = base.toStar >= top;
    // 최대 별 달성은 무기 > 방어구 > 장신구 순으로 앞에
    const slotBonus = group === "무기" ? 80 : ARMOR.has(group) ? 40 : 0;
    return { ...base, type: "star", reached, weight: reached ? 900 + slotBonus + Math.min(100, quality) / 2 : 300 + (base.toStar / top) * 200 + quality / 2 };
  }
  if (from.name === to.name && jump === 0) {
    return gain >= OPTION_MIN ? { ...base, type: "option", reached: false, weight: 500 + Math.min(40, gain) * 10 } : null;
  }
  if ((from.name !== to.name && !SHUFFLED.has(group)) || jump > 5) {
    return gain >= NEW_MIN ? { ...base, type: "new", reached: base.toStar >= top, weight: 400 + Math.min(100, quality) * 3 } : null;
  }
  return null;
}

/**
 * 하루치 기록 → { counts: { star, reached, option, new, characters }, events }
 * events: 종류마다 무게 위 perType 개를 모아 무게 순으로.
 * @param {Array<{ ocid: string, worldName: string, characterName: string, changes: any[] }>} rows
 */
function buildNews(rows, perType = 60) {
  const byType = { star: [], option: [], new: [] };
  const people = new Set();
  const counts = { star: 0, reached: 0, option: 0, new: 0, characters: 0 };
  for (const row of rows) {
    for (const change of Array.isArray(row.changes) ? row.changes : []) {
      const event = classifyChange(change);
      if (!event) continue;
      counts[event.type] += 1;
      if (event.type === "star" && event.reached) counts.reached += 1;
      people.add(row.ocid);
      byType[event.type].push({ ...event, ocid: row.ocid, world: row.worldName, name: row.characterName });
    }
  }
  counts.characters = people.size;
  const byWeight = (a, b) => b.weight - a.weight || b.gain - a.gain;
  const events = Object.values(byType)
    .flatMap((list) => list.sort(byWeight).slice(0, perType))
    .sort(byWeight);
  return { counts, events };
}

/** 소식 → 전광판 한 줄 */
function newsLine(event) {
  if (event.type === "star") return `축하해요! ${event.world} ${event.name}님 ${event.item} ★${event.toStar}${event.reached ? " 달성" : ""}`;
  if (event.type === "option") return `${event.world} ${event.name}님 ${event.item} 옵션 대박! 템환산 +${event.gain}`;
  return `${event.world} ${event.name}님 새 장비 ${event.item}${event.toStar ? ` ★${event.toStar}` : ""}`;
}

module.exports = { classifyChange, buildNews, newsLine, maxStar, groupOf };
