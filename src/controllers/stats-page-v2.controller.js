// v2 statistics over the collected characters.
//   GET /api/v2/stats/classes?world_name=&top=1000  → { ok, top, total, classes: [...] }
//   GET /api/v2/stats/levels?world_name=&min_level=260 → { ok, minLevel, total, levels: [...], classes: [...] }
//   GET /api/v2/stats/job-meta?world_name=&class=     → { ok, className, classes, count, damageName, summary, weapon, accessories }
//   GET /api/v2/stats/hall-of-fame                     → { ok, updatedAt, records: [{ key, title, unit, rows, leaders }] }
//   GET /api/v2/stats/job-top?class=&ocid=             → { ok, className, me, leader, average } (칸별 템환산 원점수)
//   GET /api/v2/game/pool                              → { ok, pool: [{ name, world, className, level, power, itemScore, potential, additionalPotential, maxDamage }] }
const { normalizeWorldName } = require("../config/worlds");
const { classStats, levelStats, jobMeta, jobTop, hallOfFame, gamePool } = require("../services/stats.service");

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

const getGamePool = handler(() => gamePool());

module.exports = { getClassStats, getLevelStats, getJobMeta, getJobTop, getHallOfFame, getGamePool };
