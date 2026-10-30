// 코디 채우기: 하루 한 번(서버 시작 20분 뒤부터 24시간마다) 모은 캐릭터 중 코디가 없거나 7일 지난 캐릭터를 최근 확인 순으로
// 4만 명까지, 캐릭터마다 beauty-equipment + cashitem-equipment 를 읽어 recordLook. 화면 조회와 따로 도는 넥슨 클라이언트.
const mongoose = require("mongoose");
const { env } = require("../config/env");
const { createNexonClient } = require("../nexon/client");
const { CharacterSpec } = require("../models/character-spec.model");
const { CharacterLook } = require("../models/character-look.model");
const { recordLook } = require("../services/looks.service");

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_DELAY_MS = 20 * 60 * 1000;
const FRESH_MS = 7 * DAY_MS;
const PER_RUN = 40000;
const WORKERS = 6;

const client = createNexonClient({ baseUrl: env.nexonBaseUrl, apiKey: env.nexonApiKey, maxConcurrency: WORKERS, ttlMs: () => 0 });
const read = async (path, ocid) => (await client.request(`/maplestorym/v1/character/${path}`, { ocid }, { useCache: false }))?.data;

async function collectOnce({ limit = PER_RUN } = {}) {
  const fresh = new Set((await CharacterLook.find({ checkedAt: { $gte: new Date(Date.now() - FRESH_MS) } }, { _id: 0, ocid: 1 }).lean()).map((row) => row.ocid));
  const targets = [];
  for await (const spec of CharacterSpec.find({ ocid: { $type: "string" } }, { _id: 0, ocid: 1, worldName: 1, characterName: 1, characterClass: 1 }).sort({ checkedAt: -1 }).lean().cursor()) {
    if (!fresh.has(spec.ocid)) targets.push(spec);
    if (targets.length >= limit) break;
  }
  let saved = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const target = targets[next];
      next += 1;
      try {
        const [beauty, cash] = await Promise.all([read("beauty-equipment", target.ocid), read("cashitem-equipment", target.ocid)]);
        if (await recordLook({ ...target, beauty, cash })) saved += 1;
      } catch {
        failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return { targets: targets.length, saved, failed };
}

let timer = null;
const lookCollectionJob = {
  start() {
    if (timer) return;
    const run = async () => {
      if (env.lookCollectionEnabled && env.nexonApiKey && mongoose.connection.readyState === 1) {
        const started = Date.now();
        try {
          const result = await collectOnce();
          console.log(`[look-collection] ${result.targets} targets: saved ${result.saved}, failed ${result.failed} in ${Math.round((Date.now() - started) / 1000)}s`);
        } catch (error) {
          console.error("[look-collection] failed:", error?.message || error);
        }
      }
      timer = setTimeout(run, DAY_MS);
      timer.unref?.();
    };
    timer = setTimeout(run, FIRST_DELAY_MS);
    timer.unref?.();
  },
  collectOnce
};

module.exports = { lookCollectionJob };
