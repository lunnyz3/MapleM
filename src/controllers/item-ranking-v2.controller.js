// v2 item and spec ranking API (data collected from lookups and the daily ranking collection).
//   GET /api/v2/item-ranks?ocid=                         → { ok, ranks: { [fingerprint]: { rank, total, label, score, scoreWithoutEmblem } } }
//   GET /api/v2/item-ranking/groups?slot=&world_name=    → { ok, slots: [{ slot, count }], families: [{ family, count }] }
//   GET /api/v2/item-ranking?slot=&family=&world_name=&sort=&page=
//   GET /api/v2/spec-ranking?metric=&world_name=&class=&page=
//   POST /api/v2/specs { world_name, names: [] }        → { ok, specs: [{ characterName, combatPower, itemScore, … }] }
//   GET /api/v2/spec-summary?world_name=&character_name= → { ok, spec, ranks: { itemScore: { rank, total }, … } }
//   GET /api/v2/character-history?ocid=                  → { ok, events: [{ field: "name"|"guild"|"class"|"world", from, to, at }] }
//   GET /api/v2/character-record?ocid=                   → { ok, record: { best, journal, since, updatedAt } | null }
//   GET /api/v2/collection-summary                        → { ok, characters } (모은 캐릭터 수)
const { normalizeWorldName } = require("../config/worlds");
const {
  rankCharacterItems,
  listItemGroups,
  listItemRanking,
  listSpecRanking,
  findSpecs,
  rankSpec,
  collectionSummary,
  SPEC_METRICS
} = require("../services/item-ranking.service");

const { mapEquipmentItemForView } = require("./maplestorym.controller");
const { characterHistory } = require("../services/character-history.service");
const { findRecord } = require("../services/character-record.service");

const MAX_SPEC_NAMES = 300;

function text(value, max = 40) {
  return String(value ?? "").trim().slice(0, max);
}

/** "" for 전체, the canonical world name, or null (400 already sent). */
function parseWorld(req, res) {
  const input = text(req.query.world_name);
  if (!input || input === "전체") return "";
  const world = normalizeWorldName(input);
  if (!world.ok) {
    res.status(400).json({ ok: false, message: "world_name must be one of the supported worlds.", allowedWorldNames: world.allowedWorldNames });
    return null;
  }
  return world.worldNameCanonical;
}

function fail(res, error) {
  console.error("[item-ranking] read failed:", error?.message || error);
  return res.status(503).json({ ok: false, message: "랭킹을 불러오지 못했습니다." });
}

async function getItemRanks(req, res) {
  const ocid = text(req.query.ocid, 100);
  if (!/^[0-9a-f]{20,100}$/i.test(ocid)) {
    return res.status(400).json({ ok: false, message: "ocid is required" });
  }
  try {
    const ranks = await rankCharacterItems(ocid);
    res.set("Cache-Control", "private, max-age=60");
    return res.json({ ok: true, ranks });
  } catch (error) {
    return fail(res, error);
  }
}

async function getItemRankingGroups(req, res) {
  const worldName = parseWorld(req, res);
  if (worldName === null) return undefined;
  try {
    const groups = await listItemGroups({ slot: text(req.query.slot), worldName });
    res.set("Cache-Control", "public, max-age=300");
    return res.json({ ok: true, ...groups });
  } catch (error) {
    return fail(res, error);
  }
}

async function getItemRanking(req, res) {
  const worldName = parseWorld(req, res);
  if (worldName === null) return undefined;
  const slot = text(req.query.slot);
  if (!slot) {
    return res.status(400).json({ ok: false, message: "slot is required" });
  }
  try {
    const result = await listItemRanking({
      slot,
      family: text(req.query.family, 80),
      worldName,
      sort: text(req.query.sort),
      page: req.query.page
    });
    res.set("Cache-Control", "public, max-age=120");
    return res.json({
      ok: true,
      slot,
      family: text(req.query.family, 80),
      worldName,
      ...result,
      rows: result.rows.map(({ item, ...row }) => ({ ...row, item: mapEquipmentItemForView(item) }))
    });
  } catch (error) {
    return fail(res, error);
  }
}

async function getSpecRanking(req, res) {
  const worldName = parseWorld(req, res);
  if (worldName === null) return undefined;
  const metric = text(req.query.metric) || "itemScore";
  if (!Object.hasOwn(SPEC_METRICS, metric)) {
    return res.status(400).json({ ok: false, message: "unknown metric", allowedMetrics: Object.keys(SPEC_METRICS) });
  }
  try {
    const result = await listSpecRanking({ metric, worldName, characterClass: text(req.query.class), page: req.query.page });
    res.set("Cache-Control", "public, max-age=120");
    return res.json({ ok: true, worldName, ...result });
  } catch (error) {
    return fail(res, error);
  }
}

async function postSpecs(req, res) {
  const world = normalizeWorldName(text(req.body?.world_name));
  if (!world.ok) {
    return res.status(400).json({ ok: false, message: "world_name must be one of the supported worlds." });
  }
  const names = Array.isArray(req.body?.names) ? [...new Set(req.body.names.map((name) => text(name, 24)).filter(Boolean))] : [];
  if (!names.length || names.length > MAX_SPEC_NAMES) {
    return res.status(400).json({ ok: false, message: `names must have 1 to ${MAX_SPEC_NAMES} entries` });
  }
  try {
    const specs = await findSpecs(world.worldNameCanonical, names);
    res.set("Cache-Control", "private, max-age=60");
    return res.json({ ok: true, specs });
  } catch (error) {
    return fail(res, error);
  }
}

async function getSpecSummary(req, res) {
  const world = normalizeWorldName(text(req.query.world_name));
  const name = text(req.query.character_name, 24);
  if (!world.ok || !name) {
    return res.status(400).json({ ok: false, message: "world_name and character_name are required" });
  }
  try {
    const result = await rankSpec(world.worldNameCanonical, name);
    res.set("Cache-Control", "private, max-age=60");
    return res.json({ ok: true, spec: result?.spec || null, ranks: result?.ranks || {} });
  } catch (error) {
    return fail(res, error);
  }
}

async function getCharacterHistory(req, res) {
  const ocid = text(req.query.ocid, 100);
  if (!/^[0-9a-f]{20,100}$/i.test(ocid)) {
    return res.status(400).json({ ok: false, message: "ocid is required" });
  }
  try {
    const events = await characterHistory(ocid);
    res.set("Cache-Control", "private, max-age=300");
    return res.json({ ok: true, events });
  } catch (error) {
    return fail(res, error);
  }
}

async function getCharacterRecord(req, res) {
  const ocid = text(req.query.ocid, 100);
  if (!/^[0-9a-f]{20,100}$/i.test(ocid)) {
    return res.status(400).json({ ok: false, message: "ocid is required" });
  }
  try {
    const record = await findRecord(ocid);
    res.set("Cache-Control", "private, max-age=60");
    return res.json({ ok: true, record });
  } catch (error) {
    return fail(res, error);
  }
}

async function getCollectionSummary(req, res) {
  try {
    const summary = await collectionSummary();
    res.set("Cache-Control", "public, max-age=300");
    return res.json({ ok: true, ...summary });
  } catch (error) {
    return fail(res, error);
  }
}

module.exports = {
  getCollectionSummary,
  getItemRanks,
  getItemRankingGroups,
  getItemRanking,
  getSpecRanking,
  postSpecs,
  getSpecSummary,
  getCharacterHistory,
  getCharacterRecord
};
