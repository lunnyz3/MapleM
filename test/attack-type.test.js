const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveAttackType } = require("../src/controllers/maplestorym.controller");

const statData = (physical, magical) => ({
  stat: [
    { stat_name: "물리 공격력", stat_value: String(physical) },
    { stat_name: "마법 공격력", stat_value: String(magical) }
  ]
});

// Values measured from the official stat endpoint on 2026-10-28.
test("attack type follows the character's own stats", () => {
  assert.equal(resolveAttackType({ statData: statData(54073, 112170), className: "캡틴" }), "magical");
  assert.equal(resolveAttackType({ statData: statData(58507, 129979), className: "메카닉" }), "magical");
  assert.equal(resolveAttackType({ statData: statData(130742, 55858), className: "렌" }), "physical");
});

test("without stats the job-name fallback treats 캡틴 and 메카닉 as magical", () => {
  assert.equal(resolveAttackType({ className: "캡틴" }), "magical");
  assert.equal(resolveAttackType({ className: "메카닉" }), "magical");
  assert.equal(resolveAttackType({ className: "바이퍼" }), "physical");
});

test("unknown jobs without stats default to physical", () => {
  assert.equal(resolveAttackType({ className: "새로운직업" }), "physical");
});
