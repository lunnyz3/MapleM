// Nexon vmatrix response → one core model shared by stat calculation and the view.
//
// 2026-07-09: slot_id, slot_level and vcore_name started returning null; 2026-09-17 they
// were removed (Nexon notices N-3496311, N-3546529). Cores are now named by
// vcore_skill_name1..4 and carry vcore_equipment_flag / vcore_expire_flag ("1" or "0").
// Older stored logs still have the legacy fields, so both shapes are accepted.

function toFlag(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value === true || String(value).trim() === "1";
}

function toLevel(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeVcore(core) {
  const skills = [core?.vcore_skill_name1, core?.vcore_skill_name2, core?.vcore_skill_name3, core?.vcore_skill_name4]
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  const score = Number(core?.vcore_score);

  return {
    name: String(core?.vcore_name || "").trim() || skills[0] || "",
    skills,
    type: String(core?.vcore_type || "").trim(),
    level: toLevel(core?.vcore_level),
    // Only present in responses from before 2026-09-17.
    legacySlotLevel: toLevel(core?.slot_level),
    equipped: toFlag(core?.vcore_equipment_flag, true),
    expired: toFlag(core?.vcore_expire_flag, false),
    score: Number.isFinite(score) ? score : null
  };
}

function normalizeVmatrixCores(vmatrixData) {
  const cores = vmatrixData?.character_v_core_equipment;
  return Array.isArray(cores) ? cores.map(normalizeVcore) : [];
}

// Cores that actually apply in game: equipped and not expired.
function getActiveVcores(vmatrixData) {
  return normalizeVmatrixCores(vmatrixData).filter((core) => core.equipped && !core.expired);
}

module.exports = { getActiveVcores, normalizeVcore, normalizeVmatrixCores };
