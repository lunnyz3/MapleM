"use strict";

// 레벨 300 레이스 중계(GET /api/v2/level-race): 공식 레벨 랭킹 상위 20명의 레벨·경험치를 15분마다 character/basic 으로 읽어 쌓고
// (level_race, 14일 보관) 오늘 증가·48시간 평균 속도·Lv.299/300 도달 예상을 낸다. 처음 Lv.299·300에 닿은 것을 확인하면 따로 남긴다.
// 빼 달라는 캐릭터는 LEVEL_RACE_EXCLUDE("월드/이름,…"). 시간대별 기록은 내보내지 않는다. 계산은 domain/race/level-race.js.
const mongoose = require("mongoose");
const { LevelRace } = require("../models/level-race.model");
const { CharacterSpec } = require("../models/character-spec.model");
const { getCharacterByOcid, getCharacterOcid, getRankingLevel } = require("./maplestorym.service");
const { raceBoard, TARGET } = require("../domain/race/level-race");
const { env } = require("../config/env");

const RACERS = 20;
const WORKERS = 4;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const POINT_TTL_MS = 14 * DAY_MS;
const RACER_TTL_MS = HOUR_MS;
const BOARD_TTL_MS = 60 * 1000;
const FIRST_LEVELS = [299, TARGET];
const DB_TIMEOUT_MS = 5000;

let racerCache = { at: 0, value: null };
let boardCache = { at: 0, value: null };
const ocids = new Map();

const isMongoConnected = () => mongoose.connection.readyState === 1;
const kstDate = (ms) => new Date(ms + 9 * HOUR_MS).toISOString().slice(0, 10);
const excluded = () =>
  new Set(
    String(env.levelRaceExclude || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

/** 집계가 끝난 가장 최근 날짜의 레벨 랭킹 1쪽(새벽엔 어제 것) */
async function latestLevelRanking(now = Date.now()) {
  for (const daysAgo of [0, 1, 2]) {
    const date = kstDate(now - daysAgo * DAY_MS);
    const rows = (await getRankingLevel({ date, page: 1 }, { useCache: false }).catch(() => null))?.data?.ranking;
    if (Array.isArray(rows) && rows.length) return { date, rows };
  }
  return { date: null, rows: [] };
}

/** 레이스 참가자: 레벨 랭킹 상위 20명(뺀 캐릭터 제외), 1시간 보관 */
async function currentRacers() {
  if (racerCache.value && Date.now() - racerCache.at < RACER_TTL_MS) return racerCache.value;
  const { date, rows } = await latestLevelRanking();
  const skip = excluded();
  const racers = rows
    .filter((row) => !skip.has(`${row.world_name}/${row.character_name}`))
    .slice(0, RACERS)
    .map((row) => ({ world: row.world_name, name: row.character_name, className: row.character_class || "", guild: row.guild_name || "", ranking: row.ranking }));
  if (racers.length) racerCache = { at: Date.now(), value: { date, racers } };
  return racerCache.value || { date, racers };
}

async function racerOcid(world, name) {
  const key = `${world}|${name}`;
  if (ocids.has(key)) return ocids.get(key);
  const spec = await CharacterSpec.findOne({ worldName: world, characterName: name }, { _id: 0, ocid: 1 }).lean().maxTimeMS(DB_TIMEOUT_MS);
  const ocid = spec?.ocid || (await getCharacterOcid(name, world).catch(() => null))?.data?.ocid || "";
  if (ocid) ocids.set(key, ocid);
  return ocid;
}

/** 15분마다: 참가자 레벨·경험치를 한 줄씩 남기고, 처음 Lv.299·300에 닿은 것을 확인하면 기록 */
async function checkRacers(now = new Date()) {
  if (!isMongoConnected()) return { checked: 0 };
  const { racers } = await currentRacers();
  const docs = [];
  let next = 0;
  const worker = async () => {
    while (next < racers.length) {
      const racer = racers[next];
      next += 1;
      try {
        const ocid = await racerOcid(racer.world, racer.name);
        if (!ocid) continue;
        const basic = (await getCharacterByOcid("/maplestorym/v1/character/basic", ocid, { useCache: false }))?.data;
        const level = Number(basic?.character_level) || 0;
        if (!level) continue;
        docs.push({
          kind: "point",
          ocid,
          worldName: racer.world,
          characterName: String(basic.character_name || racer.name),
          characterClass: String(basic.character_class || racer.className),
          level,
          exp: Number(basic.character_exp) || 0,
          expRate: Number(String(basic.character_exp_rate ?? "").replace(/[^0-9.]/g, "")) || 0,
          at: now,
          expiresAt: new Date(now.getTime() + POINT_TTL_MS)
        });
      } catch {
        // 다음 순찰에 다시 읽는다
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  if (docs.length) await LevelRace.insertMany(docs, { ordered: false });
  for (const level of FIRST_LEVELS) {
    const reached = docs.filter((doc) => doc.level >= level).sort((a, b) => b.level - a.level || b.expRate - a.expRate)[0];
    if (!reached) continue;
    const { ocid, worldName, characterName, characterClass } = reached;
    await LevelRace.updateOne({ kind: "first", level }, { $setOnInsert: { kind: "first", level, ocid, worldName, characterName, characterClass, at: now } }, { upsert: true });
  }
  boardCache = { at: 0, value: null };
  return { checked: docs.length };
}

/** 중계판(1분 보관): 참가자마다 지금 레벨·경험치 %, 오늘·24시간 증가, 순위 변화, 다음 레벨·300 도달 예상, 처음 도달 기록 */
async function levelRaceBoard(now = Date.now()) {
  if (boardCache.value && now - boardCache.at < BOARD_TTL_MS) return boardCache.value;
  if (!isMongoConnected()) return null;
  const { date, racers } = await currentRacers();
  const known = (await Promise.all(racers.map(async (racer) => ({ ...racer, key: await racerOcid(racer.world, racer.name).catch(() => "") })))).filter(
    (racer) => racer.key
  );
  const points = await LevelRace.find(
    { kind: "point", ocid: { $in: known.map((racer) => racer.key) }, at: { $gte: new Date(now - 49 * HOUR_MS) } },
    { _id: 0, ocid: 1, characterName: 1, level: 1, expRate: 1, at: 1 }
  )
    .sort({ at: 1 })
    .lean()
    .maxTimeMS(DB_TIMEOUT_MS);
  const byKey = new Map();
  const latestName = new Map();
  for (const point of points) {
    if (!byKey.has(point.ocid)) byKey.set(point.ocid, []);
    byKey.get(point.ocid).push(point);
    latestName.set(point.ocid, point.characterName);
  }
  const board = raceBoard(known, byKey, now);
  const firsts = await LevelRace.find({ kind: "first" }, { _id: 0, level: 1, worldName: 1, characterName: 1, characterClass: 1, at: 1 })
    .sort({ level: 1 })
    .lean()
    .maxTimeMS(DB_TIMEOUT_MS);
  const value = {
    target: TARGET,
    rankingDate: date,
    checkedAt: board.rows.reduce((latest, row) => Math.max(latest, row.state.at), 0) || null,
    rows: board.rows.map((row) => ({
      rank: row.rank,
      rankChange: row.rankChange,
      world: row.world,
      name: latestName.get(row.key) || row.name,
      className: row.className,
      guild: row.guild,
      level: row.state.level,
      expRate: row.state.expRate,
      today: row.state.today,
      day: row.state.day,
      pace: row.state.pace,
      nextLevel: row.state.nextLevel,
      nextAt: row.state.nextAt,
      targetAt: row.state.targetAt,
      remaining: row.state.remaining,
      fastest: row.key === board.fastest
    })),
    firsts: firsts.map((first) => ({ level: first.level, world: first.worldName, name: first.characterName, className: first.characterClass, at: first.at }))
  };
  boardCache = { at: now, value };
  return value;
}

module.exports = { checkRacers, levelRaceBoard, latestLevelRanking };
