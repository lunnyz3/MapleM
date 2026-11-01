// 레벨 300 레이스: 서버 시작 2분 뒤, 그다음 15분마다 레벨 랭킹 상위 20명의 레벨·경험치를 읽는다(src/services/level-race.service.js).
// server.js 에서만 시작한다.
const mongoose = require("mongoose");
const { env } = require("../config/env");
const { checkRacers } = require("../services/level-race.service");

const INTERVAL_MS = 15 * 60 * 1000;
const FIRST_DELAY_MS = 2 * 60 * 1000;

let timer = null;
let running = false;

const levelRaceJob = {
  start() {
    if (timer) return;
    const run = async () => {
      if (!running && env.levelRaceEnabled && env.nexonApiKey && mongoose.connection.readyState === 1) {
        running = true;
        try {
          const result = await checkRacers();
          if (!result.checked) console.log("[level-race] no racers checked");
        } catch (error) {
          console.error("[level-race] failed:", error?.message || error);
        } finally {
          running = false;
        }
      }
      timer = setTimeout(run, INTERVAL_MS);
      timer.unref?.();
    };
    timer = setTimeout(run, FIRST_DELAY_MS);
    timer.unref?.();
  }
};

module.exports = { levelRaceJob };
