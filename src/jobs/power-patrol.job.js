// 전투력 순찰(src/services/power-patrol.service.js)을 넥슨·MongoDB 에 잇는다. server.js 에서만 시작한다.
// 화면 조회와 따로 도는 넥슨 클라이언트를 쓴다: 동시 요청 수를 따로 세고, 응답은 보관하지 않는다.
const mongoose = require("mongoose");
const { env } = require("../config/env");
const { createNexonClient } = require("../nexon/client");
const { CharacterSpec } = require("../models/character-spec.model");
const { recordPeakPower } = require("../services/character-record.service");
const { createPowerPatrol } = require("../services/power-patrol.service");

const statPath = "/maplestorym/v1/character/stat";

const client = createNexonClient({
  baseUrl: env.nexonBaseUrl,
  apiKey: env.nexonApiKey,
  maxConcurrency: env.powerPatrolConcurrency,
  ttlMs: () => 0
});

/** stat 응답의 "전투력"(없으면 null) */
function readPower(data) {
  const entry = (Array.isArray(data?.stat) ? data.stat : []).find((item) => String(item?.stat_name || "").trim() === "전투력");
  const value = Number(String(entry?.stat_value ?? "").replace(/[^0-9.]/g, ""));
  return value > 0 ? value : null;
}

const powerPatrol = createPowerPatrol({
  isAvailable: () => env.powerPatrolEnabled && Boolean(env.nexonApiKey) && mongoose.connection.readyState === 1,
  // 스펙의 전투력·확인 시각은 날짜별 기록이 생기기 전 값을 지키는 데 쓴다(recordPeakPower seed)
  listTargets: () =>
    CharacterSpec.find({ ocid: { $type: "string" } }, { _id: 0, ocid: 1, worldName: 1, characterName: 1, combatPower: 1, checkedAt: 1 }).lean(),
  fetchPower: async (ocid) => readPower((await client.request(statPath, { ocid }, { useCache: false }))?.data),
  recordPeak: recordPeakPower,
  intervalMs: env.powerPatrolIntervalMinutes * 60 * 1000,
  workers: env.powerPatrolConcurrency
});

module.exports = { powerPatrol, readPower, patrolClient: client };
