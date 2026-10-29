// v2 statistics over the collected characters.
//   GET /api/v2/stats/classes?world_name=&top=1000  → { ok, top, total, classes: [...] }
//   GET /api/v2/stats/levels?world_name=&min_level=260 → { ok, minLevel, total, levels: [...], classes: [...] }
const { normalizeWorldName } = require("../config/worlds");
const { classStats, levelStats } = require("../services/stats.service");

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

module.exports = { getClassStats, getLevelStats };
