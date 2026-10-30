"use strict";

// 코디(순수 함수): 넥슨 beauty-equipment·cashitem-equipment 응답 → 저장할 작은 모양(헤어·성형·피부·지금 입은 캐시템 이름).
// 아이콘 주소는 길어서 아이템 이름별로 따로(cosmetic_items) 한 번만 남긴다.

// 겉모습 순위에 쓰는 칸만 남긴다(반지 4칸·이펙트·보조무기는 빼서 저장을 줄인다)
const SLOTS = new Set(["모자", "한벌옷", "상의", "하의", "신발", "장갑", "망토", "무기", "얼굴장식", "눈장식", "귀고리", "탈것", "의자"]);

const text = (value) => {
  const out = String(value ?? "").trim();
  return out && out !== "null" ? out : "";
};

function part(raw) {
  const name = text(raw?.hair_name ?? raw?.face_name);
  if (!name) return null;
  return { name, color: text(raw?.base_color), mix: text(raw?.mix_color), rate: Number(raw?.mix_rate) || 0 };
}

/**
 * @param {{ beauty?: any, cash?: any }} input 넥슨 응답의 data
 * @returns {{ gender: string, hair: any, face: any, skin: string, items: Array<{ slot: string, name: string }>, icons: Array<{ name: string, slot: string, icon: string }> } | null}
 *   헤어·성형·캐시템이 하나도 없으면 null
 */
function lookFromApi({ beauty, cash }) {
  const hair = part(beauty?.character_hair);
  const face = part(beauty?.character_face);
  const skin = text(beauty?.character_skin_name);
  const seen = new Set();
  const items = [];
  const icons = [];
  for (const item of Array.isArray(cash?.cash_item_equipment) ? cash.cash_item_equipment : []) {
    const name = text(item?.cash_item_name);
    const slot = text(item?.cash_item_equipment_slot_name) || text(item?.cash_item_equipment_page_name);
    if (!name || !SLOTS.has(slot) || seen.has(`${slot}|${name}`)) continue;
    seen.add(`${slot}|${name}`);
    items.push({ slot, name });
    const icon = text(item?.cash_item_icon);
    if (/^https:\/\//.test(icon)) icons.push({ name, slot, icon });
  }
  if (!hair && !face && !items.length) return null;
  const gender = text(beauty?.character_gender || cash?.character_gender);
  return { gender: gender === "Female" || gender === "Male" ? gender : "", hair, face, skin, items, icons };
}

/** 순위 목록: [{ name, count }] → share(전체 대비)를 붙여 limit 개 */
function withShare(rows, total, limit = 30) {
  return rows.slice(0, limit).map((row) => ({ ...row, share: total ? Math.round((row.count / total) * 10000) / 10000 : 0 }));
}

module.exports = { lookFromApi, withShare, SLOTS };
