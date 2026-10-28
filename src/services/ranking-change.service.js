// Ranking pages with the rank change (▲▼) against the previous aggregation day.
// Nexon keeps past rankings (`date`), so nothing is stored: the previous day's
// rows around the same page are fetched and matched by name.
const { TtlLruCache } = require("../nexon/client");

// Nexon ranking data starts on 2025-11-27.
const rankingDateFloor = "2025-11-27";
const rankingPageSize = 200;
// Top 10,000 → 50 pages of 200 rows.
const maxRankingPage = 50;

const rankingTypes = Object.freeze({
  level: { endpoint: "/maplestorym/v1/ranking/level", kind: "character" },
  "combat-power": { endpoint: "/maplestorym/v1/ranking/combat-power", kind: "character" },
  union: { endpoint: "/maplestorym/v1/ranking/union", kind: "character" },
  achievement: { endpoint: "/maplestorym/v1/ranking/achievement", kind: "character" },
  "root-of-time": { endpoint: "/maplestorym/v1/ranking/root-of-time", kind: "character" },
  "sharenian-waterway": { endpoint: "/maplestorym/v1/ranking/sharenian-waterway", kind: "guild" },
  // Battlefield seasons run four weeks apart, so a rank change is not meaningful.
  "sharenian-battlefield": { endpoint: "/maplestorym/v1/ranking/sharenian-battlefield", kind: "guild", compare: false }
});

// How far back the previous aggregation day is searched.
const previousLookbackDays = 7;
// Guild rankings skip days (e.g. between seasons); an empty requested day falls
// back to the latest day with data, like the ranking page does.
const guildEmptyFallbackDays = 14;
const responseCacheTtlMs = 5 * 60 * 1000;

function toKstDateText(timestamp) {
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shiftDateText(dateText, dayOffset) {
  const [year, month, day] = String(dateText).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + dayOffset)).toISOString().slice(0, 10);
}

// Today's ranking before the 02:30 KST aggregation answers with one of these.
function isNotReadyError(error) {
  const status = error?.response?.status;
  if (status !== 400 && status !== 404) {
    return false;
  }
  const text = JSON.stringify(error.response?.data || "").toLowerCase();
  return text.includes("please wait until the data is ready") || text.includes("please input valid parameter");
}

function isClientError(error) {
  const status = error?.response?.status;
  return status >= 400 && status < 500 && status !== 429;
}

function rowKey(kind, row) {
  const name = kind === "guild" ? row?.guild_name : row?.character_name;
  return `${row?.world_name ?? ""}\u0000${name ?? ""}`;
}

function rowRank(row, worldName) {
  const value = Number(worldName ? row?.world_ranking : row?.ranking);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Adds rank / previousRank / rankChange / isNew to each row. previousRows null = no previous data. */
function annotateRankChange(rows, previousRows, { kind, worldName }) {
  let previousRanks = null;
  if (previousRows) {
    previousRanks = new Map();
    for (const row of previousRows) {
      const key = rowKey(kind, row);
      const rank = rowRank(row, worldName);
      if (rank !== null && (!previousRanks.has(key) || rank < previousRanks.get(key))) {
        previousRanks.set(key, rank);
      }
    }
  }

  return rows.map((row) => {
    const rank = rowRank(row, worldName);
    const previousRank = previousRanks ? previousRanks.get(rowKey(kind, row)) ?? null : null;
    return {
      ...row,
      rank,
      previousRank,
      rankChange: previousRank !== null && rank !== null ? previousRank - rank : null,
      isNew: Boolean(previousRanks) && previousRank === null
    };
  });
}

/**
 * fetchRanking(endpointPath, params) → { data: { ranking: [] } } (the Nexon client's request).
 */
function createRankingChangeService({
  fetchRanking,
  now = Date.now,
  cache = new TtlLruCache({ maxEntries: 500, maxBytes: 32 * 1024 * 1024, now })
}) {
  async function fetchRows(endpoint, date, page, worldName) {
    const params = { date, page };
    if (worldName) {
      params.world_name = worldName;
    }
    const result = await fetchRanking(endpoint, params);
    const ranking = result?.data?.ranking;
    return Array.isArray(ranking) ? ranking : [];
  }

  // A page past the end is empty too, so "no data that day" is decided by page 1.
  async function dayHasData(endpoint, date, worldName, knownPages) {
    if (knownPages.some(({ page, rows }) => page === 1 || rows.length)) {
      return knownPages.some(({ rows }) => rows.length > 0);
    }
    return (await fetchRows(endpoint, date, 1, worldName)).length > 0;
  }

  async function resolveCurrent({ type, date, page, worldName, today }) {
    const { endpoint, kind } = rankingTypes[type];
    let usedDate = date;
    for (let stepsBack = 0; ; stepsBack += 1) {
      const canStepBack = shiftDateText(usedDate, -1) >= rankingDateFloor;
      let rows;
      try {
        rows = await fetchRows(endpoint, usedDate, page, worldName);
      } catch (error) {
        // Before 02:30 KST today's ranking is not ready yet: show yesterday instead.
        if (usedDate === today && isNotReadyError(error) && canStepBack) {
          usedDate = shiftDateText(usedDate, -1);
          continue;
        }
        throw error;
      }
      if (rows.length || !canStepBack) {
        return { date: usedDate, rows };
      }
      const mayStepBack = usedDate === today || (kind === "guild" && stepsBack < guildEmptyFallbackDays);
      if (!mayStepBack || (await dayHasData(endpoint, usedDate, worldName, [{ page, rows }]))) {
        return { date: usedDate, rows };
      }
      usedDate = shiftDateText(usedDate, -1);
    }
  }

  // Rows of the same page and the pages around it on the latest earlier day with data.
  // Returns { date, rows } or null; a transient Nexon failure gives up the comparison.
  async function resolvePrevious({ type, date, page, worldName }) {
    const { endpoint } = rankingTypes[type];
    const pages = [page - 1, page, page + 1].filter((value) => value >= 1 && value <= maxRankingPage);
    for (let offset = 1; offset <= previousLookbackDays; offset += 1) {
      const candidate = shiftDateText(date, -offset);
      if (candidate < rankingDateFloor) {
        return null;
      }
      const results = await Promise.all(
        pages.map((value) =>
          fetchRows(endpoint, candidate, value, worldName).then(
            (rows) => ({ page: value, rows }),
            (error) => {
              if (!isClientError(error)) {
                throw error;
              }
              return { page: value, rows: [] };
            }
          )
        )
      );
      let hasData;
      try {
        hasData = await dayHasData(endpoint, candidate, worldName, results);
      } catch (error) {
        if (!isClientError(error)) {
          throw error;
        }
        hasData = false;
      }
      if (hasData) {
        return { date: candidate, rows: results.flatMap((result) => result.rows) };
      }
    }
    return null;
  }

  async function getRankingWithChange({ type, date, page = 1, worldName = "" }) {
    const definition = rankingTypes[type];
    if (!definition) {
      throw new Error(`unknown ranking type: ${type}`);
    }
    const today = toKstDateText(now());
    const requestedDate = date || today;
    const cacheKey = `${type}|${requestedDate}|${page}|${worldName}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const current = await resolveCurrent({ type, date: requestedDate, page, worldName, today });
    let previous = null;
    let comparisonFailed = false;
    if (current.rows.length && definition.compare !== false) {
      try {
        previous = await resolvePrevious({ type, date: current.date, page, worldName });
      } catch (error) {
        // Rows are still useful without ▲▼; do not cache the degraded answer.
        comparisonFailed = true;
        console.error(`[ranking-change] previous ${type} lookup failed:`, error?.message || error);
      }
    }

    const payload = {
      ok: true,
      type,
      date: current.date,
      previousDate: previous?.date ?? null,
      page,
      worldName: worldName || null,
      rows: annotateRankChange(current.rows, previous?.rows ?? null, { kind: definition.kind, worldName })
    };
    if (!comparisonFailed) {
      cache.set(cacheKey, payload, responseCacheTtlMs, JSON.stringify(payload).length);
    }
    return payload;
  }

  return { getRankingWithChange };
}

module.exports = {
  annotateRankChange,
  createRankingChangeService,
  maxRankingPage,
  rankingDateFloor,
  rankingPageSize,
  rankingTypes,
  shiftDateText,
  toKstDateText
};
