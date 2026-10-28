// 기준 캐릭터 고정 데이터(test/fixtures/characters)로 주요 스탯을 계산해 스냅샷을 다시 만든다.
// 계산 규칙을 의도적으로 바꾼 뒤에만 실행하고, git diff로 바뀐 출처·값을 검토한다.
//   node scripts/dev/update-stat-snapshots.js
const fs = require("fs");
const path = require("path");
const { buildCharacterStats } = require("../../src/domain/stats");

const fixtureDir = path.resolve(__dirname, "../../test/fixtures/characters");
const snapshotDir = path.resolve(__dirname, "../../test/fixtures/stat-snapshots");

function round(value) {
  return Math.round(value * 1000) / 1000;
}

// { key: { value, sources: { "장비 > 기본 옵션 > 아이템 · 스탯": value } } }
function summarize(majorStats) {
  const summary = {};
  for (const [key, stat] of Object.entries(majorStats)) {
    const sources = {};
    for (const entry of stat.breakdown) {
      const label = `${entry.categoryLabel} > ${entry.groupLabel} > ${entry.source}`;
      sources[label] = round((sources[label] || 0) + entry.value);
    }
    summary[key] = { value: round(stat.value), sources };
  }
  return summary;
}

function computeSnapshot(fixture) {
  const stats = buildCharacterStats(fixture.details);
  const setting = stats.statSetting;
  return {
    world: fixture.world,
    name: fixture.name,
    setting: {
      selection: setting.selection,
      currentSelection: setting.currentSelection,
      combinationCount: setting.combinationCount,
      combatPower: setting.combatPower
    },
    boss: summarize(stats.majorStats),
    current: summarize(stats.majorStatsCurrent)
  };
}

if (require.main === module) {
  fs.mkdirSync(snapshotDir, { recursive: true });
  for (const file of fs.readdirSync(fixtureDir).filter((name) => name.endsWith(".json"))) {
    const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, file), "utf8"));
    fs.writeFileSync(path.join(snapshotDir, file), `${JSON.stringify(computeSnapshot(fixture), null, 2)}\n`);
    console.log(`snapshot: ${file}`);
  }
}

module.exports = { computeSnapshot, fixtureDir, snapshotDir };
