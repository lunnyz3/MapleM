// 레벨 N 이상 캐릭터를 한 번 훑어 장비를 모은다(아이템·스펙 랭킹).
// 넥슨 랭킹은 상위 1만 명까지라서, 랭킹 캐릭터들이 속한 길드와 길드 랭킹의 길드를 모두 열어
// 길드원 레벨로 대상을 넓힌다. 오늘 이미 모은 캐릭터는 건너뛴다(--force 면 다시).
//
//   node scripts/data/sweep-characters.js --min-level 270 [--force] [--dry-run]
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../..");
const envFile = [path.join(rootDir, ".env"), path.resolve(rootDir, "../../../.env")].find((file) => fs.existsSync(file));
if (envFile) dotenv.config({ path: envFile, quiet: true });

const mongoose = require("mongoose");
const { collectorDeps } = require("../../src/jobs/item-collection.job");
const { createItemCollector } = require("../../src/services/item-collection.service");
const { sweepCandidates } = require("../../src/services/character-sweep.service");
const {
  getRankingLevel,
  getRankingCombatPower,
  getRankingRootOfTime,
  getRankingUnion,
  getRankingAchievement,
  getRankingSharenianWaterway,
  getRankingSharenianBattlefield,
  getGuildId,
  getGuildBasic
} = require("../../src/services/maplestorym.service");

const args = process.argv.slice(2);
const minLevel = Number(args[args.indexOf("--min-level") + 1]) || 270;
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const kstDate = (offsetDays = 0) => new Date(Date.now() + KST_OFFSET_MS + offsetDays * 86400000).toISOString().slice(0, 10);

const fetchers = {
  level: getRankingLevel,
  "combat-power": getRankingCombatPower,
  "root-of-time": getRankingRootOfTime,
  union: getRankingUnion,
  achievement: getRankingAchievement,
  "sharenian-waterway": getRankingSharenianWaterway,
  "sharenian-battlefield": getRankingSharenianBattlefield
};

// Latest aggregated day per ranking (today before ~02:30 KST has no data yet; guild rankings skip days).
const dateCache = new Map();
async function fetchRanking(type, page) {
  if (!dateCache.has(type)) {
    let found = null;
    for (let back = 0; back <= 14 && !found; back += 1) {
      const date = kstDate(-back);
      try {
        const rows = (await fetchers[type]({ date, page: 1 }))?.data?.ranking || [];
        if (rows.length) found = date;
      } catch {
        // not aggregated yet
      }
    }
    dateCache.set(type, found);
  }
  const date = dateCache.get(type);
  if (!date) return [];
  try {
    return (await fetchers[type]({ date, page }))?.data?.ranking || [];
  } catch {
    return [];
  }
}

async function fetchGuildMembers(worldName, guildName) {
  const id = (await getGuildId(guildName, worldName))?.data?.oguild_id;
  if (!id) return [];
  const basic = (await getGuildBasic(id))?.data;
  return Array.isArray(basic?.guild_member) ? basic.guild_member : [];
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const loadRows = async () => {
    const { rows, stats } = await sweepCandidates({ fetchRanking, fetchGuildMembers, minLevel });
    console.log(`candidates Lv.${minLevel}+: ${rows.length} (${JSON.stringify(stats)})`);
    return { date: null, rows: dryRun ? [] : rows };
  };
  const collector = createItemCollector({ ...collectorDeps, loadRows, workers: 4, delayMs: 0 });
  const timer = setInterval(() => {
    const status = collector.getStatus();
    if (status.total) console.log(`${status.state} ${status.saved + status.skipped + status.failed}/${status.total} (saved ${status.saved}, skipped ${status.skipped}, failed ${status.failed})`);
  }, 60 * 1000);
  const status = await collector.runOnce({ force });
  clearInterval(timer);
  console.log(JSON.stringify(status));
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
