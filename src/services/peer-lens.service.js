"use strict";

// 동급 비교(캐릭터 화면, GET /api/v2/stats/peers): 모은 스펙 전체를 한 시간마다 읽어 직업·레벨대(5레벨)·월드·생성 연도별
// 전투력·템환산 정렬 배열을 만들어 두고(사냥 프리셋으로 잰 듯한 전투력은 뺀다), 캐릭터가 그 안에서 위에서 몇 %인지 낸다.
// 길드는 부를 때 길드원 스펙으로(길드마다 1시간 보관), 내실 지수는 같은 직업 배열에서. 계산은 domain/stats/peer-lens.js.
const mongoose = require("mongoose");
const { CharacterSpec } = require("../models/character-spec.model");
const { GuildRoster } = require("../models/guild-roster.model");
const { getGuildBasic, getGuildId } = require("./maplestorym.service");
const { gamePeers, PLAUSIBLE_RATIO } = require("./stats.service");
const { fairRatio } = require("../domain/stats/game-pool");
const { bandStart, lensOf, innerIndex } = require("../domain/stats/peer-lens");
const { SCORE_VERSION } = require("../domain/items/score");
const { TtlLruCache } = require("../nexon/client");
const scoreMax = require("../game-data/item-score-max.json");

const SNAPSHOT_TTL_MS = 60 * 60 * 1000;
const RESULT_TTL_MS = 10 * 60 * 1000;
const GUILD_TTL_MS = 60 * 60 * 1000;
const SNAPSHOT_TIMEOUT_MS = 60000;
const DB_TIMEOUT_MS = 5000;
// 생성 연도 무리는 생성일을 아는 캐릭터가 이만큼 모이기 전엔 보이지 않는다
const MIN_YEAR_SAMPLE = 30;
const MIN_GUILD_SAMPLE = 5;
const OCID_PATTERN = /^[0-9a-f]{16,96}$/i;
const POINT_SCORE = scoreMax.fullSet.max / 100;

const resultCache = new TtlLruCache({ maxEntries: 3000, maxBytes: 8 * 1024 * 1024 });
const guildCache = new TtlLruCache({ maxEntries: 300, maxBytes: 4 * 1024 * 1024 });
let snapshot = { value: null, at: 0, pending: null };

const isMongoConnected = () => mongoose.connection.readyState === 1;
const asc = (list) => Float64Array.from(list).sort();

/** 생성 연도(서울 기준), 모르면 0 */
function createdYear(date) {
  const at = date ? new Date(date).getTime() : NaN;
  return Number.isFinite(at) ? new Date(at + 9 * 60 * 60 * 1000).getUTCFullYear() : 0;
}

/** 사냥 프리셋으로 잰 듯한 전투력(비슷한 캐릭터 중앙값의 0.3배 아래)은 0 */
function plausiblePower(row, medians) {
  const power = Number(row?.combatPower) || 0;
  if (!(power > 0)) return 0;
  const ratio = fairRatio(row, medians);
  return ratio === null || ratio >= PLAUSIBLE_RATIO ? power : 0;
}

async function buildSnapshot() {
  const medians = await gamePeers();
  const groups = new Map();
  const inner = new Map();
  const add = (key, power, score) => {
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { power: [], item: [] }));
    if (power > 0) group.power.push(power);
    if (score > 0) group.item.push(score);
  };
  // 한꺼번에 읽지 않고 나눠 읽는다(14.8만 명)
  const cursor = CharacterSpec.find(
    { scoreVersion: SCORE_VERSION, characterLevel: { $gt: 0 } },
    { _id: 0, characterClass: 1, characterLevel: 1, worldName: 1, combatPower: 1, itemScore: 1, characterCreatedAt: 1 }
  )
    .lean()
    .maxTimeMS(SNAPSHOT_TIMEOUT_MS)
    .cursor({ batchSize: 2000 });
  let total = 0;
  for await (const row of cursor) {
    total += 1;
    const power = plausiblePower(row, medians);
    const score = Number(row.itemScore) || 0;
    const year = createdYear(row.characterCreatedAt);
    if (row.characterClass) add(`class|${row.characterClass}`, power, score);
    add(`band|${bandStart(row.characterLevel)}`, power, score);
    if (row.worldName) add(`world|${row.worldName}`, power, score);
    if (year) add(`year|${year}`, power, score);
    if (power > 0 && score > 0 && row.characterClass) {
      if (!inner.has(row.characterClass)) inner.set(row.characterClass, []);
      inner.get(row.characterClass).push({ level: row.characterLevel, score, power });
    }
  }
  for (const group of groups.values()) {
    group.power = asc(group.power);
    group.item = asc(group.item);
  }
  return { groups, inner, total, builtAt: new Date().toISOString() };
}

/** 분포 스냅샷(1시간). 다시 만드는 동안에는 이전 것을 쓴다. */
function peerSnapshot() {
  if (snapshot.value && Date.now() - snapshot.at < SNAPSHOT_TTL_MS) return Promise.resolve(snapshot.value);
  if (!snapshot.pending) {
    snapshot.pending = buildSnapshot().then(
      (value) => {
        snapshot = { value, at: Date.now(), pending: null };
        return value;
      },
      (error) => {
        snapshot.pending = null;
        throw error;
      }
    );
  }
  return snapshot.value ? Promise.resolve(snapshot.value) : snapshot.pending;
}

/** 길드원 이름(들고 난 기록, 없으면 넥슨 길드 정보) → 길드원 스펙의 전투력·템환산 배열. 길드를 못 찾으면 null */
async function guildGroup(worldName, guildName, medians) {
  const key = `${worldName}|${guildName}`;
  const hit = guildCache.get(key);
  if (hit !== undefined) return hit;
  let names = (await GuildRoster.findOne({ worldName, guildName }, { _id: 0, members: 1 }).lean().maxTimeMS(DB_TIMEOUT_MS))?.members;
  if (!names?.length) {
    const id = (await getGuildId(guildName, worldName).catch(() => null))?.data?.oguild_id;
    const basic = id ? (await getGuildBasic(id).catch(() => null))?.data : null;
    names = (Array.isArray(basic?.guild_member) ? basic.guild_member : []).map((member) => member?.character_name).filter((name) => name && name !== "-");
  }
  let group = null;
  if (names.length) {
    const specs = await CharacterSpec.find(
      { worldName, characterName: { $in: names }, scoreVersion: SCORE_VERSION },
      { _id: 0, characterLevel: 1, combatPower: 1, itemScore: 1 }
    )
      .lean()
      .maxTimeMS(DB_TIMEOUT_MS);
    group = {
      members: names.length,
      power: asc(specs.map((spec) => plausiblePower(spec, medians)).filter((power) => power > 0)),
      item: asc(specs.map((spec) => Number(spec.itemScore) || 0).filter((score) => score > 0))
    };
  }
  guildCache.set(key, group, GUILD_TTL_MS, 2048);
  return group;
}

/**
 * 동급 비교와 내실 지수. 모은 스펙이 없으면 null(조회 직후면 잠시 뒤 다시).
 * @param {{ ocid: string, guildName?: string }} input
 */
async function peerLens({ ocid, guildName = "" }) {
  const key = String(ocid || "").trim();
  if (!OCID_PATTERN.test(key) || !isMongoConnected()) return null;
  const guild = String(guildName || "").trim();
  const cacheKey = `${key}|${guild}`;
  const hit = resultCache.get(cacheKey);
  if (hit) return hit;

  const me = await CharacterSpec.findOne(
    { ocid: key, scoreVersion: SCORE_VERSION },
    { _id: 0, worldName: 1, characterName: 1, characterClass: 1, characterLevel: 1, combatPower: 1, itemScore: 1, characterCreatedAt: 1 }
  )
    .lean()
    .maxTimeMS(DB_TIMEOUT_MS);
  if (!me) return null;
  const [snap, medians] = await Promise.all([peerSnapshot(), gamePeers()]);
  const mine = { power: plausiblePower(me, medians), score: Number(me.itemScore) || 0 };
  const band = bandStart(me.characterLevel);
  const year = createdYear(me.characterCreatedAt);
  const lens = (props, group, minSample) => {
    const found = lensOf(group, mine, minSample);
    return found ? { ...props, ...found } : null;
  };

  const lenses = [
    lens({ key: "class", label: me.characterClass }, snap.groups.get(`class|${me.characterClass}`)),
    lens({ key: "level", label: `Lv.${band}~${band + 4}` }, snap.groups.get(`band|${band}`)),
    lens({ key: "world", label: me.worldName }, snap.groups.get(`world|${me.worldName}`))
  ];
  if (guild) {
    const group = await guildGroup(me.worldName, guild, medians).catch(() => null);
    if (group) lenses.push(lens({ key: "guild", label: guild, members: group.members }, group, MIN_GUILD_SAMPLE));
  }
  const yearGroup = year ? snap.groups.get(`year|${year}`) : null;
  if (yearGroup && Math.max(yearGroup.power.length, yearGroup.item.length) >= MIN_YEAR_SAMPLE) {
    lenses.push(lens({ key: "year", label: `${year}년 생성` }, yearGroup));
  }

  const result = {
    me: {
      world: me.worldName,
      name: me.characterName,
      className: me.characterClass,
      level: me.characterLevel,
      power: mine.power,
      itemScore: mine.score,
      createdYear: year || null
    },
    lenses: lenses.filter(Boolean),
    inner: innerIndex(snap.inner.get(me.characterClass) || [], { level: me.characterLevel, score: mine.score, power: mine.power }, POINT_SCORE),
    collected: snap.total,
    builtAt: snap.builtAt
  };
  resultCache.set(cacheKey, result, RESULT_TTL_MS, 4096);
  return result;
}

module.exports = { peerLens, peerSnapshot, createdYear };
