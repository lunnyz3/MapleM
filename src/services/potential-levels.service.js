"use strict";

// 잠재 수준(GET /api/v2/item-levels, 캐릭터 장비 시트의 '갈아타기 손익'): 모은 아케인셰이드·제네시스 장비를 하루 한 번
// 읽어 계열·부위·공격 타입별 잠재+에디 점수 하위 25%·중앙값·상위 25% 장비의 줄을 메모리에 둔다(새 컬렉션·색인 없음).
// 1단계는 점수만 읽고(운영 DB 약 17.5만 개, 13초 안팎), 2단계는 고른 장비 몇백 개만 _id 로 읽는다.
// 계산은 domain/items/potential-levels.js.
const mongoose = require("mongoose");
const { EquipmentItem } = require("../models/equipment-item.model");
const { SCORE_VERSION } = require("../domain/items/score");
const { FAMILIES, createLevelPicker, levelLines, findLevels } = require("../domain/items/potential-levels");

const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
// 만들다 실패하면 이만큼 지난 뒤 다시 해 본다(요청마다 무거운 읽기를 되풀이하지 않게).
const RETRY_MS = 10 * 60 * 1000;
const READ_TIMEOUT_MS = 120000;

let snapshot = { value: null, at: 0, pending: null, failedAt: 0 };

const isMongoConnected = () => mongoose.connection.readyState === 1;

async function buildSnapshot() {
  const started = Date.now();
  const cursor = EquipmentItem.find(
    { scoreVersion: SCORE_VERSION, family: { $in: FAMILIES } },
    { _id: 1, slot: 1, family: 1, attackType: 1, "parts.potential": 1, "parts.additionalPotential": 1 }
  )
    .lean()
    .maxTimeMS(READ_TIMEOUT_MS)
    .cursor({ batchSize: 5000 });
  const picker = createLevelPicker();
  let total = 0;
  for await (const doc of cursor) {
    total += 1;
    picker.add({
      id: String(doc._id),
      family: doc.family,
      slot: doc.slot,
      attackType: doc.attackType,
      score: (Number(doc.parts?.potential) || 0) + (Number(doc.parts?.additionalPotential) || 0)
    });
  }
  const picked = picker.pick();
  const ids = [...new Set([...picked.values()].flatMap((group) => group.picks.map((pick) => String(pick.id))))];
  const docs = ids.length
    ? await EquipmentItem.find(
        { _id: { $in: ids } },
        {
          "item.item_potential_option": 1,
          "item.item_additional_potential_option": 1,
          "item.item_potential_option_grade": 1,
          "item.item_additional_potential_option_grade": 1
        }
      )
        .lean()
        .maxTimeMS(READ_TIMEOUT_MS)
    : [];
  const byId = new Map(docs.map((doc) => [String(doc._id), doc.item]));
  const groups = new Map();
  for (const [key, group] of picked) {
    const levels = group.picks
      .filter((pick) => byId.has(String(pick.id)))
      .map(({ key: level, label, score, id }) => ({ key: level, label, score, ...levelLines(byId.get(String(id))) }));
    if (levels.length === group.picks.length) groups.set(key, { sample: group.sample, levels });
  }
  const builtAt = new Date().toISOString();
  console.log(`[item-levels] ${groups.size} groups from ${total} items in ${Date.now() - started}ms`);
  return { groups, total, builtAt };
}

/** 잠재 수준 스냅샷(하루). 다시 만드는 동안에는 이전 것을 쓴다. DB가 없으면 null. */
function potentialLevelSnapshot() {
  const now = Date.now();
  if (snapshot.value && now - snapshot.at < SNAPSHOT_TTL_MS) return Promise.resolve(snapshot.value);
  if (!isMongoConnected()) return Promise.resolve(snapshot.value);
  if (!snapshot.pending && now - snapshot.failedAt >= RETRY_MS) {
    snapshot.pending = buildSnapshot().then(
      (value) => {
        snapshot = { value, at: Date.now(), pending: null, failedAt: 0 };
        return value;
      },
      (error) => {
        console.error("[item-levels] build failed:", error?.message || error);
        snapshot = { ...snapshot, pending: null, failedAt: Date.now() };
        return snapshot.value;
      }
    );
  }
  if (snapshot.value || !snapshot.pending) return Promise.resolve(snapshot.value);
  return snapshot.pending;
}

/**
 * 한 칸의 잠재 수준(하위 25%·중간·상위 25% 대표 줄). 모은 장비가 모자라거나 DB가 없으면 levels 가 null.
 * @param {{ family: string, slot: string, attackType: string }} query
 */
async function potentialLevels(query) {
  const value = await potentialLevelSnapshot();
  const found = value ? findLevels(value.groups, query) : null;
  return {
    levels: found ? found.levels : null,
    sample: found ? found.sample : 0,
    scope: found ? found.scope : "",
    builtAt: value ? value.builtAt : null
  };
}

module.exports = { potentialLevels, potentialLevelSnapshot };
