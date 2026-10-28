const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { computeSnapshot, fixtureDir, snapshotDir } = require("../scripts/dev/update-stat-snapshots");

// Reference characters captured on 2026-10-28. When a stat rule changes on purpose, run
// `node scripts/dev/update-stat-snapshots.js` and review the diff.
for (const file of fs.readdirSync(fixtureDir).filter((name) => name.endsWith(".json"))) {
  test(`major stats for ${file} match the reviewed snapshot`, () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, file), "utf8"));
    const expected = JSON.parse(fs.readFileSync(path.join(snapshotDir, file), "utf8"));
    assert.deepEqual(computeSnapshot(fixture), expected);
  });
}
