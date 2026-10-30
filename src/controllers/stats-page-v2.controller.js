// v2 statistics over the collected characters.
//   GET /api/v2/stats/classes?world_name=&top=1000  → { ok, top, total, classes: [...] }
//   GET /api/v2/stats/levels?world_name=&min_level=260 → { ok, minLevel, total, levels: [...], classes: [...] }
//   GET /api/v2/stats/job-meta?world_name=&class=     → { ok, className, classes, count, damageName, summary, weapon, accessories }
//   GET /api/v2/stats/hall-of-fame                     → { ok, updatedAt, records: [{ key, title, unit, rows, leaders }] }
//   GET /api/v2/stats/job-top?class=&ocid=             → { ok, className, me, leader, average } (칸별 템환산 원점수)
//   GET /api/v2/stats/tiers?world_name=&basis=power|gear → { ok, basis, tiers: [{ tier, classes: [{ className, count, average, gear, best }] }] }
//   GET /api/v2/stats/worlds                           → { ok, worlds: [{ world, rank, count, average, itemScore, best, cuts, popular }] }
//   GET /api/v2/stats/boss-reach                       → { ok, total, bosses: [{ name, difficulty, count, share }] } (모은 캐릭터 중 입장 가능 비율)
//   GET /api/v2/stats/twins?ocid=                      → { ok, me, twins: [{ world, name, className, level, power, itemScore, potential, additionalPotential }] }
//   GET /api/v2/stats/card?ocid=&power=                → { ok, card: { className, count, ovr, tier, tierLabel, stats: [{ key, label, name, value, top, rating }] } | null }
//   GET /api/v2/game/pool                              → { ok, pool: [{ id, name, world, className, level, power, itemScore, potential, additionalPotential, maxDamage }] }
//   GET /api/v2/game/items                             → { ok, items: [{ name, icon, slot, grade }] } (장비 놀이용 300개)
//   GET /api/v2/game/gear?ids=id,id                    → { ok, gear: { [id]: [{ slot, name, icon, star, grade, potential, additional }] } }
const { normalizeWorldName } = require("../config/worlds");
const { classStats, levelStats, jobMeta, jobTop, hallOfFame, gamePool, gameGear, gameItems, characterCard, specTwins, jobTiers, worldStats, bossReach } = require("../services/stats.service");

/** "" for 전체, the canonical world name, or null (400 already sent). */
function parseWorld(req, res) {
  const input = String(req.query.world_name || "").trim();
  if (!input || input === "전체") return "";
  const world = normalizeWorldName(input);
  if (!world.ok) {
    res.status(400).json({ ok: false, message: "world_name must be one of the supported worlds." });
    return null;
  }
  return world.worldNameCanonical;
}

function handler(compute) {
  return async (req, res) => {
    const worldName = parseWorld(req, res);
    if (worldName === null) return undefined;
    try {
      const result = await compute(req, worldName);
      res.set("Cache-Control", "public, max-age=300");
      return res.json({ ok: true, worldName, ...result });
    } catch (error) {
      console.error("[stats] read failed:", error?.message || error);
      return res.status(503).json({ ok: false, message: "통계를 불러오지 못했습니다." });
    }
  };
}

const getClassStats = handler((req, worldName) => classStats({ worldName, top: req.query.top }));
const getLevelStats = handler((req, worldName) => levelStats({ worldName, minLevel: req.query.min_level }));

const getJobMeta = handler((req, worldName) => jobMeta({ worldName, className: String(req.query.class || "").trim().slice(0, 20) }));

const getHallOfFame = handler(() => hallOfFame());
const getJobTop = handler((req) =>
  jobTop({ className: String(req.query.class || "").trim().slice(0, 20), ocid: String(req.query.ocid || "").trim().slice(0, 80) })
);

const getJobTiers = handler((req, worldName) => jobTiers({ worldName, basis: req.query.basis === "gear" ? "gear" : "power" }));
const getWorldStats = handler(() => worldStats());
const getBossReach = handler(() => bossReach());
const getSpecTwins = handler((req) => specTwins({ ocid: String(req.query.ocid || "").trim().slice(0, 100) }));
const getCharacterCard = handler((req) => characterCard({ ocid: String(req.query.ocid || "").trim().slice(0, 100), power: req.query.power }));
const getGamePool = handler(() => gamePool());
const getGameItems = handler(() => gameItems());
const getGameGear = handler((req) => gameGear(String(req.query.ids || "").slice(0, 200).split(",")));

module.exports = { getClassStats, getLevelStats, getJobMeta, getJobTop, getHallOfFame, getCharacterCard, getSpecTwins, getJobTiers, getWorldStats, getBossReach, getGamePool, getGameGear, getGameItems };
