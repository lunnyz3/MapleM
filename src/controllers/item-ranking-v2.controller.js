// v2 item and spec ranking API (data collected from lookups and the daily ranking collection).
//   GET /api/v2/item-ranks?ocid=                         → { ok, ranks: { [fingerprint]: { rank, total, label, score, scoreWithoutEmblem } } }
//   GET /api/v2/item-ranking/groups?slot=&world_name=    → { ok, slots: [{ slot, count }], families: [{ family, count }] }
//   GET /api/v2/item-ranking?slot=&family=&world_name=&sort=&page=&star=&section=&option=&lines=
//       조건: star = 스타포스 이상, section(potential|additionalPotential|additional)에 option 이 lines 줄 이상
//   GET /api/v2/item-search/slots?slot=                  → { ok, slots: [{ slot, weapon }], families: [] }
//   GET /api/v2/item-search?slot=&family=&world_name=&name=&star=&c=&page=
//       c = "potential:물리 대미지:50|additional:최종 대미지:6" (묶음:옵션:값 합 이상, 최대 3개) → { ok, rows, page, hasMore, partial }
//       나보다 좋은 장비: above=점수(이보다 높은 것만) &order=near(가까운 것부터) &exact=1(name 과 같은 이름만) &not=ocid(이 캐릭터 장비 빼기)
//   GET /api/v2/spec-ranking?metric=&world_name=&class=&page=
//   POST /api/v2/specs { world_name, names: [] }        → { ok, specs: [{ characterName, combatPower, power, itemScore, … }] }
//                                                           power: 사냥 프리셋으로 잰 듯한 전투력은 0(모름)
//   GET /api/v2/spec-summary?world_name=&character_name= → { ok, spec, ranks: { itemScore: { rank, total }, … } }
//   GET /api/v2/character-history?ocid=                  → { ok, events: [{ field: "name"|"guild"|"class"|"world", from, to, at }] }
//   GET /api/v2/character-record?ocid=                   → { ok, record: { best, journal, since, updatedAt } | null }
//   GET /api/v2/ranking-history?ocid=&type=power|level   → { ok, type, points: [{ date, ranking, value }] } (넥슨 과거 랭킹 약 16일)
//   GET /api/v2/guild-roster?world_name=&guild_name=     → { ok, roster: { since, count, events: [{ date, joined, left }], counts } | null }
//   POST /api/v2/multi-search { entries: [{ world?, name }], world_name? } → { ok, rows: [{ world, name, className, level, power, itemScore, … }] } (최대 30명)
//   GET /api/v2/ranking-cuts?type=combat-power|level      → { ok, type, cuts: [{ rank, points: [{ date, value }] }] } (1·100·1,000·10,000위, 12주)
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
  searchItems,
  searchSlots,
  parseSearchConditions,
  SPEC_METRICS
} = require("../services/item-ranking.service");

const { mapEquipmentItemForView } = require("./maplestorym.controller");
const { characterHistory } = require("../services/character-history.service");
const { findRecord, multiSearch, recordBriefs, suggestCharacters } = require("../services/character-record.service");
const { plausiblePowers } = require("../services/stats.service");
const { rankingHistory } = require("../services/ranking-history.service");
const { rankingCuts } = require("../services/ranking-cuts.service");
const { guildRoster } = require("../services/guild-roster.service");

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
      page: req.query.page,
      condition: { minStar: req.query.star, section: text(req.query.section), option: text(req.query.option), lines: req.query.lines }
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

async function getItemSearchSlots(req, res) {
  try {
    const result = await searchSlots(text(req.query.slot));
    res.set("Cache-Control", "public, max-age=600");
    return res.json({ ok: true, ...result });
  } catch (error) {
    return fail(res, error);
  }
}

async function getItemSearch(req, res) {
  const worldName = parseWorld(req, res);
  if (worldName === null) return undefined;
  const slot = text(req.query.slot);
  if (!slot) {
    return res.status(400).json({ ok: false, message: "slot is required" });
  }
  try {
    const result = await searchItems({
      slot,
      family: text(req.query.family, 80),
      worldName,
      name: text(req.query.name, 30),
      exactName: req.query.exact === "1",
      minStar: req.query.star,
      above: req.query.above === undefined || req.query.above === "" ? null : Number(req.query.above),
      nearest: req.query.order === "near",
      notOcid: /^[0-9a-f]{20,100}$/i.test(text(req.query.not, 100)) ? text(req.query.not, 100) : "",
      conditions: parseSearchConditions(text(req.query.c, 200)),
      page: req.query.page
    });
    res.set("Cache-Control", "public, max-age=120");
    return res.json({ ok: true, slot, ...result, rows: result.rows.map(({ item, ...row }) => ({ ...row, item: mapEquipmentItemForView(item) })) });
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
    const powers = await plausiblePowers(specs).catch(() => specs.map(() => 0));
    res.set("Cache-Control", "private, max-age=60");
    return res.json({ ok: true, specs: specs.map((spec, index) => ({ ...spec, power: powers[index] })) });
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

async function getRankingHistory(req, res) {
  const ocid = text(req.query.ocid, 100);
  if (!/^[0-9a-f]{20,100}$/i.test(ocid)) {
    return res.status(400).json({ ok: false, message: "ocid is required" });
  }
  try {
    const history = await rankingHistory({ ocid, type: req.query.type === "level" ? "level" : "power" });
    res.set("Cache-Control", "private, max-age=600");
    return res.json({ ok: true, ...history });
  } catch (error) {
    return fail(res, error);
  }
}

async function getGuildRoster(req, res) {
  const world = normalizeWorldName(text(req.query.world_name));
  const guildName = text(req.query.guild_name, 24);
  if (!world.ok || !guildName) {
    return res.status(400).json({ ok: false, message: "world_name and guild_name are required" });
  }
  try {
    const roster = await guildRoster(world.worldNameCanonical, guildName);
    res.set("Cache-Control", "private, max-age=60");
    return res.json({ ok: true, roster });
  } catch (error) {
    return fail(res, error);
  }
}

const MULTI_NAME = /^[가-힣A-Za-z0-9]{2,12}$/;

async function postMultiSearch(req, res) {
  let worldName = "";
  if (text(req.body?.world_name)) {
    const world = normalizeWorldName(text(req.body.world_name));
    if (!world.ok) return res.status(400).json({ ok: false, message: "world_name must be one of the supported worlds." });
    worldName = world.worldNameCanonical;
  }
  const entries = [];
  for (const entry of Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 30) : []) {
    const name = text(entry?.name, 24);
    if (!MULTI_NAME.test(name)) continue;
    let world = "";
    if (text(entry?.world)) {
      const normalized = normalizeWorldName(text(entry.world));
      if (!normalized.ok) continue;
      world = normalized.worldNameCanonical;
    }
    entries.push({ world, name });
  }
  if (!entries.length) return res.status(400).json({ ok: false, message: "entries must have 1 to 30 names" });
  try {
    const rows = await multiSearch(entries, worldName);
    res.set("Cache-Control", "private, max-age=60");
    return res.json({ ok: true, rows });
  } catch (error) {
    return fail(res, error);
  }
}

async function getRankingCuts(req, res) {
  try {
    const cuts = await rankingCuts({ type: req.query.type === "level" ? "level" : "combat-power" });
    res.set("Cache-Control", "public, max-age=1800");
    return res.json({ ok: true, ...cuts });
  } catch (error) {
    return fail(res, error);
  }
}

// POST /api/v2/records/brief { characters: [{ world, name }] }
//   → { ok, briefs: [{ world, name, className, level, power, itemScore, potential, additionalPotential, checkedAt, brief }] }
async function postRecordBriefs(req, res) {
  const list = (Array.isArray(req.body?.characters) ? req.body.characters : [])
    .slice(0, 12)
    .map((entry) => ({ world: normalizeWorldName(text(entry?.world, 20)), name: text(entry?.name, 24).trim() }))
    .filter((entry) => entry.world.ok && entry.name)
    .map((entry) => ({ world: entry.world.worldNameCanonical, name: entry.name }));
  if (!list.length) return res.status(400).json({ ok: false, message: "characters is required" });
  try {
    const briefs = await recordBriefs(list);
    res.set("Cache-Control", "private, max-age=60");
    return res.json({ ok: true, briefs });
  } catch (error) {
    return fail(res, error);
  }
}

// GET /api/v2/suggest?q=&world_name= → { ok, characters: [{ world, name, className, level, power }] } (검색 자동완성)
async function getSuggest(req, res) {
  const q = text(req.query.q, 24);
  const world = normalizeWorldName(text(req.query.world_name, 20));
  try {
    const characters = await suggestCharacters({ q, world: world.ok ? world.worldNameCanonical : "" });
    res.set("Cache-Control", "public, max-age=60");
    return res.json({ ok: true, characters });
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
  getItemSearch,
  getItemSearchSlots,
  getCollectionSummary,
  getItemRanks,
  getItemRankingGroups,
  getItemRanking,
  getSpecRanking,
  postSpecs,
  getSpecSummary,
  getCharacterHistory,
  getCharacterRecord,
  getRankingHistory,
  getRankingCuts,
  postMultiSearch,
  getGuildRoster,
  postRecordBriefs,
  getSuggest
};
