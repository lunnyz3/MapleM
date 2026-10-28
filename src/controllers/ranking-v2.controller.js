// v2 ranking API: a Nexon ranking page with the change against the previous aggregation day.
//   GET /api/v2/ranking/:type?date=YYYY-MM-DD&page=N&world_name=
//   → { ok, type, date, previousDate, page, worldName, rows: [{ ...row, rank, previousRank, rankChange, isNew }] }
const { env } = require("../config/env");
const { normalizeWorldName } = require("../config/worlds");
const {
  getRankingLevel,
  getRankingCombatPower,
  getRankingUnion,
  getRankingAchievement,
  getRankingRootOfTime,
  getRankingSharenianWaterway,
  getRankingSharenianBattlefield
} = require("../services/maplestorym.service");
const {
  createRankingChangeService,
  maxRankingPage,
  rankingDateFloor,
  rankingTypes,
  toKstDateText
} = require("../services/ranking-change.service");

// Same shared Nexon client (cache, dedupe, backoff) as the v1 ranking routes.
const fetchersByEndpoint = new Map([
  [rankingTypes.level.endpoint, getRankingLevel],
  [rankingTypes["combat-power"].endpoint, getRankingCombatPower],
  [rankingTypes.union.endpoint, getRankingUnion],
  [rankingTypes.achievement.endpoint, getRankingAchievement],
  [rankingTypes["root-of-time"].endpoint, getRankingRootOfTime],
  [rankingTypes["sharenian-waterway"].endpoint, getRankingSharenianWaterway],
  [rankingTypes["sharenian-battlefield"].endpoint, getRankingSharenianBattlefield]
]);

const defaultService = createRankingChangeService({
  fetchRanking: (endpoint, params) => fetchersByEndpoint.get(endpoint)(params)
});

function isValidDateText(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }
  const [year, month, day] = text.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/** → { type, date, page, worldName } or sends a 4xx and returns null. */
function parseRankingV2Query(req, res, now = Date.now()) {
  const fail = (status, message, extra = {}) => {
    res.status(status).json({ ok: false, message, ...extra });
    return null;
  };

  const type = String(req.params.type || "");
  if (!Object.hasOwn(rankingTypes, type)) {
    return fail(404, "unknown ranking type", { allowedTypes: Object.keys(rankingTypes) });
  }

  const today = toKstDateText(now);
  const date = String(req.query.date || "").trim().replace(/[./\s]+/g, "-") || today;
  if (!isValidDateText(date)) {
    return fail(400, "date must be YYYY-MM-DD");
  }
  if (date < rankingDateFloor) {
    return fail(400, `date must be ${rankingDateFloor} or later`);
  }
  if (date > today) {
    return fail(400, "date must not be in the future");
  }

  const pageText = String(req.query.page || "").trim();
  const page = pageText ? Number(pageText) : 1;
  if (!Number.isInteger(page) || page < 1 || page > maxRankingPage) {
    return fail(400, `page must be an integer from 1 to ${maxRankingPage}`);
  }

  const worldInput = String(req.query.world_name || "").trim();
  let worldName = "";
  if (worldInput && worldInput !== "전체") {
    const world = normalizeWorldName(worldInput);
    if (!world.ok) {
      return fail(400, "world_name must be one of the supported worlds.", {
        allowedWorldNames: world.allowedWorldNames
      });
    }
    worldName = world.worldNameCanonical;
  }

  return { type, date, page, worldName };
}

function createRankingV2Handler({ service = defaultService, hasApiKey = () => Boolean(env.nexonApiKey) } = {}) {
  return async function getRankingV2(req, res) {
    if (!hasApiKey()) {
      return res.status(500).json({ ok: false, message: "NEXON_OPEN_API_KEY is not configured" });
    }
    const query = parseRankingV2Query(req, res);
    if (!query) {
      return undefined;
    }
    try {
      const payload = await service.getRankingWithChange(query);
      res.set("Cache-Control", "public, max-age=60");
      return res.json(payload);
    } catch (error) {
      const statusCode = error?.response?.status || 502;
      return res.status(statusCode).json({
        ok: false,
        type: query.type,
        date: query.date,
        message: "랭킹 조회에 실패했습니다.",
        error: error?.response?.data || { message: error?.message || String(error) }
      });
    }
  };
}

module.exports = {
  createRankingV2Handler,
  getRankingV2: createRankingV2Handler(),
  parseRankingV2Query
};
