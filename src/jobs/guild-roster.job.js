// 길드 들고 난 기록을 하루 한 번: 지하수로 길드 랭킹 상위 1,000개 길드(최근 집계일, 5쪽)의 길드원 목록을 읽어
// recordGuildRoster 로 남긴다(길드마다 guild/id(6시간 보관) + guild/basic). server.js 에서만 시작한다.
const mongoose = require("mongoose");
const { env } = require("../config/env");
const { getGuildBasic, getGuildId, getRankingSharenianWaterway } = require("../services/maplestorym.service");
const { recordGuildRoster } = require("../services/guild-roster.service");

const PAGES = 5;
const WORKERS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_DELAY_MS = 15 * 60 * 1000;

const kstDate = (offsetDays = 0) => new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * DAY_MS).toISOString().slice(0, 10);

async function rankedGuilds() {
  for (let back = 0; back <= 7; back += 1) {
    const date = kstDate(-back);
    const rows = [];
    try {
      for (let page = 1; page <= PAGES; page += 1) {
        const list = (await getRankingSharenianWaterway({ date, page }))?.data?.ranking || [];
        rows.push(...list);
        if (list.length < 200) break;
      }
    } catch {
      // 그날 집계 전
    }
    if (rows.length) return rows.map((row) => ({ world: String(row.world_name || ""), guild: String(row.guild_name || "") })).filter((row) => row.world && row.guild);
  }
  return [];
}

async function sweepOnce() {
  const guilds = await rankedGuilds();
  let recorded = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < guilds.length) {
      const { world, guild } = guilds[next];
      next += 1;
      try {
        const id = (await getGuildId(guild, world))?.data?.oguild_id;
        if (!id) continue;
        const basic = await getGuildBasic(id);
        if (await recordGuildRoster(basic?.data)) recorded += 1;
      } catch {
        failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return { guilds: guilds.length, recorded, failed };
}

let timer = null;
const guildRosterJob = {
  start() {
    if (timer) return;
    const run = async () => {
      if (env.guildRosterEnabled && env.nexonApiKey && mongoose.connection.readyState === 1) {
        const started = Date.now();
        try {
          const result = await sweepOnce();
          console.log(`[guild-roster] ${result.guilds} guilds: recorded ${result.recorded}, failed ${result.failed} in ${Math.round((Date.now() - started) / 1000)}s`);
        } catch (error) {
          console.error("[guild-roster] sweep failed:", error?.message || error);
        }
      }
      timer = setTimeout(run, DAY_MS);
      timer.unref?.();
    };
    timer = setTimeout(run, FIRST_DELAY_MS);
    timer.unref?.();
  },
  sweepOnce
};

module.exports = { guildRosterJob };
