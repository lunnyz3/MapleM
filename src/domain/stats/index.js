"use strict";

// Character stat engine. Rules and constants live in src/game-data/*.json (see each _meta);
// test/stat-engine-calibration.test.js pins the results for five captured characters.

const { computeStatSheets } = require("./engine");
const { formatMajorStats, formatStatSetting, majorStatOrder } = require("./format");
const { listManualInputs, normalizeManualInputs } = require("./sources/manual");

/**
 * details → { majorStats (boss setting), majorStatsCurrent, statSetting, majorStatOrder, attackType }
 *
 * `manual` is the user's "직접 입력" ({ id: number }, ids from listManualInputs()). It is
 * validated here; `manualApplied` holds the values used and `manualWarnings` what was dropped,
 * clamped or rounded. Throws (error.code "invalid_manual" / "too_many_entries") when `manual`
 * is not an object.
 */
function buildCharacterStats(details, { manual } = {}) {
  const { values, warnings } = normalizeManualInputs(manual);
  const result = computeStatSheets(details, { manual: values });
  return {
    majorStats: formatMajorStats(result.boss),
    majorStatsCurrent: formatMajorStats(result.current),
    statSetting: formatStatSetting(result),
    majorStatOrder: majorStatOrder(result.boss),
    attackType: result.boss.attackType,
    manualApplied: values,
    manualWarnings: warnings,
    result
  };
}

module.exports = { buildCharacterStats, computeStatSheets, listManualInputs, normalizeManualInputs };
