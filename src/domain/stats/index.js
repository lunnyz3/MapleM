"use strict";

// Character stat engine. Rules and constants follow maplemworlds.kr and maplemtool.com (see
// src/game-data/*.json _meta and docs/research/calibration/engine-report.md).

const { computeStatSheets } = require("./engine");
const { formatMajorStats, formatStatSetting, majorStatOrder } = require("./format");

/**
 * details → { majorStats (boss setting), majorStatsCurrent, statSetting, majorStatOrder, attackType }
 */
function buildCharacterStats(details) {
  const result = computeStatSheets(details);
  return {
    majorStats: formatMajorStats(result.boss),
    majorStatsCurrent: formatMajorStats(result.current),
    statSetting: formatStatSetting(result),
    majorStatOrder: majorStatOrder(result.boss),
    attackType: result.boss.attackType,
    result
  };
}

module.exports = { buildCharacterStats, computeStatSheets };
