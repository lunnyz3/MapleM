// 레이스 화면(/race).
//   GET /api/v2/level-race                         → { ok, race: { target, rankingDate, checkedAt, rows: [...], firsts: [...] } | null }
//   GET /api/v2/climbers?type=&world_name=&class=  → { ok, climbers: { type, date, before, total, rows, fresh, topClass } }
//     type: level(순위 계단) | union | achievement(값 오름폭)
const { normalizeWorldName } = require("../config/worlds");
const { levelRaceBoard } = require("../services/level-race.service");
const { weeklyClimbers, CLIMBER_TYPES } = require("../services/weekly-climbers.service");

async function getLevelRace(req, res) {
  try {
    const race = await levelRaceBoard();
    res.set("Cache-Control", "public, max-age=60");
    return res.json({ ok: true, race });
  } catch (error) {
    console.error("[level-race] read failed:", error?.message || error);
    return res.status(503).json({ ok: false, message: "레이스 기록을 불러오지 못했어요." });
  }
}

async function getClimbers(req, res) {
  const type = String(req.query.type || "level");
  if (!CLIMBER_TYPES.includes(type)) return res.status(400).json({ ok: false, message: `type must be one of ${CLIMBER_TYPES.join(", ")}` });
  let worldName = "";
  if (req.query.world_name) {
    const world = normalizeWorldName(String(req.query.world_name));
    if (!world.ok) return res.status(400).json({ ok: false, message: "world_name must be one of the supported worlds." });
    worldName = world.worldNameCanonical;
  }
  try {
    const climbers = await weeklyClimbers({ type, worldName, className: String(req.query.class || "").trim().slice(0, 20) });
    res.set("Cache-Control", "public, max-age=600");
    return res.json({ ok: true, climbers });
  } catch (error) {
    console.error("[climbers] read failed:", error?.message || error);
    return res.status(503).json({ ok: false, message: "랭킹을 불러오지 못했어요." });
  }
}

module.exports = { getLevelRace, getClimbers };
