// v2 stat API: the "직접 입력" item list and the character stat sheets with those inputs applied.
//   GET  /api/v2/manual-inputs
//   POST /api/v2/character-stats { world_name, character_name, manual: { <id>: number } }
const { env } = require("../config/env");
const { normalizeWorldName } = require("../config/worlds");
const { buildCharacterStats, listManualInputs, normalizeManualInputs } = require("../domain/stats");
const { resolveOcid, fetchCharacterDetails, getErrorInfo, resolveAttackType } = require("./maplestorym.controller");

// The body is a world, a name and at most a few dozen numbers.
const MAX_BODY_BYTES = 4096;
const MAX_NAME_LENGTH = 40;

function badRequest(res, message, extra = {}) {
  return res.status(400).json({ ok: false, message, ...extra });
}

function getManualInputs(req, res) {
  const { items, groups, updatedAt } = listManualInputs();
  res.set("Cache-Control", "public, max-age=300");
  return res.json({ ok: true, items, groups, meta: { updatedAt } });
}

function bodySize(req) {
  const declared = Number(req.headers?.["content-length"]);
  if (Number.isFinite(declared)) return declared;
  return Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8");
}

/** Validates the body → { query, values, warnings } or sends a 4xx and returns null. */
function parseStatsBody(req, res) {
  if (bodySize(req) > MAX_BODY_BYTES) {
    res.status(413).json({ ok: false, message: `request body is larger than ${MAX_BODY_BYTES} bytes` });
    return null;
  }
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    badRequest(res, "JSON body { world_name, character_name, manual } is required");
    return null;
  }
  const characterName = typeof body.character_name === "string" ? body.character_name.trim() : "";
  const worldNameInput = typeof body.world_name === "string" ? body.world_name.trim() : "";
  if (!characterName || !worldNameInput) {
    badRequest(res, "character_name and world_name are required");
    return null;
  }
  if (characterName.length > MAX_NAME_LENGTH) {
    badRequest(res, "character_name is too long");
    return null;
  }
  const world = normalizeWorldName(worldNameInput);
  if (!world.ok) {
    badRequest(res, "world_name must be one of the supported worlds.", {
      worldNameInput: world.worldNameInput,
      allowedWorldNames: world.allowedWorldNames
    });
    return null;
  }
  let normalized;
  try {
    normalized = normalizeManualInputs(body.manual);
  } catch (error) {
    badRequest(res, error.message, { code: error.code || "invalid_manual" });
    return null;
  }
  return {
    query: { characterName, worldNameInput, worldNameCanonical: world.worldNameCanonical },
    nexonWorldName: world.nexonWorldName,
    values: normalized.values,
    warnings: normalized.warnings
  };
}

async function postCharacterStats(req, res) {
  if (!env.nexonApiKey) {
    return res.status(500).json({ ok: false, message: "NEXON_OPEN_API_KEY is missing in .env" });
  }
  const parsed = parseStatsBody(req, res);
  if (!parsed) return undefined;
  const { query, nexonWorldName, values, warnings } = parsed;

  let details;
  try {
    // Same cached Nexon client as page-data; nothing is written to the request log.
    const ocidResult = await resolveOcid(query.characterName, query.worldNameCanonical, nexonWorldName, { shouldLog: false });
    const ocid = ocidResult?.data?.ocid;
    if (!ocid) {
      return res.status(502).json({ ok: false, message: "OCID was not returned from Nexon API", query });
    }
    ({ details } = await fetchCharacterDetails({
      characterName: query.characterName,
      worldNameCanonical: query.worldNameCanonical,
      ocid,
      shouldLog: false
    }));
  } catch (error) {
    const { statusCode, errorBody, endpoint } = getErrorInfo(error);
    return res.status(statusCode).json({ ok: false, endpoint, query, error: errorBody });
  }

  let stats;
  try {
    stats = buildCharacterStats(details, { manual: values });
  } catch (error) {
    console.error("[stats-v2] stat engine failed:", error?.message || error);
    return res.status(500).json({ ok: false, message: "stat engine failed", query });
  }

  const basic = details?.basic?.data || {};
  return res.json({
    ok: true,
    query,
    profile: {
      name: basic.character_name || query.characterName,
      className: basic.character_class || basic.character_job_name || "-",
      level: basic.character_level || "-",
      attackType: resolveAttackType({
        statData: details?.stat?.data || {},
        className: basic.character_class,
        jobName: basic.character_job_name
      }),
      imageUrl: basic.character_image || basic.character_icon || ""
    },
    majorStats: stats.majorStats,
    majorStatsCurrent: stats.majorStatsCurrent,
    statSetting: stats.statSetting,
    majorStatOrder: stats.majorStatOrder,
    manualApplied: stats.manualApplied,
    manualWarnings: warnings,
    meta: { fetchedAt: new Date().toISOString() }
  });
}

module.exports = { getManualInputs, postCharacterStats, parseStatsBody, MAX_BODY_BYTES };
