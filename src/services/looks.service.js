"use strict";

// 코디 구경·통계: 캐릭터 조회 때와 하루 한 번 채울 때 코디를 남기고(recordLook), 인기 헤어·성형·피부·부위별 캐시템(1시간 보관),
// 그 코디를 한 캐릭터(무작위 24명), 무작위 코디 구경을 낸다.
const mongoose = require("mongoose");
const { CharacterLook, CosmeticItem } = require("../models/character-look.model");
const { lookFromApi, withShare } = require("../domain/looks/look");
const { TtlLruCache } = require("../nexon/client");

const DB_TIMEOUT_MS = 10000;
const STATS_TTL_MS = 60 * 60 * 1000;
const SAMPLE_TTL_MS = 10 * 60 * 1000;
const GENDERS = new Set(["Female", "Male"]);
const KINDS = new Set(["hair", "face", "skin", "item"]);
const cache = new TtlLruCache({ maxEntries: 300, maxBytes: 4 * 1024 * 1024 });
// 이미 아이콘을 남긴 아이템 이름(서버가 뜰 때 한 번 읽는다)
let knownItems = null;

const isMongoConnected = () => mongoose.connection.readyState === 1;

/** keep(value) 가 false 면 보관하지 않는다(코디를 아직 못 모았을 때 빈 순위가 1시간 남지 않게). */
async function cached(key, ttl, compute, keep = () => true) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await compute();
  if (keep(value)) cache.set(key, value, ttl, 16 * 1024);
  return value;
}

async function rememberIcons(icons) {
  if (!icons.length) return;
  if (!knownItems) knownItems = new Set((await CosmeticItem.find({}, { _id: 0, name: 1 }).lean()).map((row) => row.name));
  const fresh = icons.filter((item) => !knownItems.has(item.name));
  if (!fresh.length) return;
  fresh.forEach((item) => knownItems.add(item.name));
  await CosmeticItem.bulkWrite(
    fresh.map((item) => ({ updateOne: { filter: { name: item.name }, update: { $setOnInsert: { slot: item.slot, icon: item.icon } }, upsert: true } })),
    { ordered: false }
  );
}

/** 넥슨 beauty·cashitem 응답(data)으로 코디를 남긴다. 둘 다 비면 아무것도 하지 않는다. */
async function recordLook({ ocid, worldName = "", characterName = "", characterClass = "", beauty, cash, now = new Date() }) {
  const key = String(ocid || "").trim();
  if (!key || !isMongoConnected()) return null;
  const look = lookFromApi({ beauty, cash });
  if (!look) return null;
  const { icons, ...stored } = look;
  await CharacterLook.updateOne(
    { ocid: key },
    { $set: { ...stored, worldName, characterName, characterClass: characterClass || String(beauty?.character_class || cash?.character_class || ""), checkedAt: now } },
    { upsert: true }
  );
  await rememberIcons(icons).catch(() => {});
  return look;
}

const genderOf = (gender) => (GENDERS.has(gender) ? gender : "");

/** 인기 순위 → { total, hair, face, skin, items: { [slot]: [{ name, count, share, icon }] }, slots } */
async function lookStats({ gender = "" } = {}) {
  const want = genderOf(gender);
  if (!isMongoConnected()) return { total: 0, hair: [], face: [], skin: [], items: {}, slots: [] };
  return cached(`stats|${want}`, STATS_TTL_MS, async () => {
    const match = want ? { gender: want } : {};
    const top = (field, limit) =>
      CharacterLook.aggregate([{ $match: { ...match, [field]: { $nin: [null, ""] } } }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: limit }]).option({
        maxTimeMS: DB_TIMEOUT_MS
      });
    const [total, hair, face, skin, items] = await Promise.all([
      CharacterLook.countDocuments(match).maxTimeMS(DB_TIMEOUT_MS),
      top("hair.name", 30),
      top("face.name", 30),
      top("skin", 15),
      CharacterLook.aggregate([
        { $match: match },
        { $unwind: "$items" },
        { $group: { _id: { slot: "$items.slot", name: "$items.name" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $group: { _id: "$_id.slot", rows: { $push: { name: "$_id.name", count: "$count" } }, wearers: { $sum: "$count" } } },
        { $sort: { wearers: -1 } }
      ]).option({ maxTimeMS: DB_TIMEOUT_MS, allowDiskUse: true })
    ]);
    const bySlot = {};
    const names = new Set();
    for (const slot of items) {
      bySlot[slot._id] = slot.rows.slice(0, 15);
      bySlot[slot._id].forEach((row) => names.add(row.name));
    }
    const icons = new Map((await CosmeticItem.find({ name: { $in: [...names] } }, { _id: 0, name: 1, icon: 1 }).lean()).map((row) => [row.name, row.icon]));
    const named = (rows) => rows.map((row) => ({ name: row._id, count: row.count }));
    return {
      total,
      hair: withShare(named(hair), total),
      face: withShare(named(face), total),
      skin: withShare(named(skin), total, 15),
      slots: items.map((slot) => slot._id),
      items: Object.fromEntries(Object.entries(bySlot).map(([slot, rows]) => [slot, withShare(rows, total, 15).map((row) => ({ ...row, icon: icons.get(row.name) || "" }))]))
    };
  }, (value) => value.total > 0);
}

const PERSON = { _id: 0, worldName: 1, characterName: 1, characterClass: 1, gender: 1, hair: 1, face: 1 };
const person = (row) => ({ world: row.worldName, name: row.characterName, className: row.characterClass, gender: row.gender, hair: row.hair?.name || "", face: row.face?.name || "" });

/** 그 코디를 한 캐릭터 무작위 24명. kind: hair | face | skin | item */
async function wearers({ kind, name, gender = "" }) {
  const want = genderOf(gender);
  const value = String(name || "").trim().slice(0, 60);
  if (!KINDS.has(kind) || !value || !isMongoConnected()) return [];
  return cached(`wear|${kind}|${value}|${want}`, SAMPLE_TTL_MS, async () => {
    const field = kind === "item" ? "items.name" : kind === "skin" ? "skin" : `${kind}.name`;
    const rows = await CharacterLook.aggregate([{ $match: { [field]: value, characterName: { $ne: "" }, ...(want ? { gender: want } : {}) } }, { $sample: { size: 24 } }, { $project: PERSON }]).option({
      maxTimeMS: DB_TIMEOUT_MS
    });
    return rows.map(person);
  });
}

/** 무작위 코디 구경 24명(부르면 매번 새로) */
async function randomLooks({ gender = "" } = {}) {
  const want = genderOf(gender);
  if (!isMongoConnected()) return [];
  const rows = await CharacterLook.aggregate([{ $match: { characterName: { $ne: "" }, ...(want ? { gender: want } : {}) } }, { $sample: { size: 24 } }, { $project: PERSON }]).option({ maxTimeMS: DB_TIMEOUT_MS });
  return rows.map(person);
}

module.exports = { recordLook, lookStats, wearers, randomLooks };
