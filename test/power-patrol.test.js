const test = require("node:test");
const assert = require("node:assert/strict");
const { createPowerPatrol } = require("../src/services/power-patrol.service");
const { readPower } = require("../src/jobs/power-patrol.job");

function setup(values, { at = "2026-10-30T03:00:00Z" } = {}) {
  const clock = { now: new Date(at) };
  const calls = [];
  const patrol = createPowerPatrol({
    listTargets: async () => Object.keys(values).map((ocid) => ({ ocid, worldName: "스카니아", characterName: ocid })),
    fetchPower: async (ocid) => {
      if (values[ocid] instanceof Error) throw values[ocid];
      return values[ocid];
    },
    recordPeak: async (input) => {
      calls.push(input);
      return { todayMax: input.value, wrote: true };
    },
    now: () => clock.now,
    workers: 2,
    logger: { log() {}, error() {} }
  });
  return { patrol, calls, clock };
}

test("전투력 순찰: 그날 본 값 이하면 건너뛰고, 높아지면 다시 남긴다", async () => {
  const values = { a: 100, b: 200, c: new Error("nexon"), d: null };
  const { patrol, calls, clock } = setup(values);
  const first = await patrol.runOnce();
  assert.deepEqual([first.targets, first.fetched, first.raised, first.skipped, first.failed], [4, 2, 2, 0, 2]);
  assert.deepEqual(calls.map((call) => [call.ocid, call.value, call.characterName]), [
    ["a", 100, "a"],
    ["b", 200, "b"]
  ]);
  // 같은 날: a 는 그대로(건너뜀), b 는 보스 세팅으로 바꿔 껴서 오름
  values.b = 500;
  clock.now = new Date("2026-10-30T04:00:00Z");
  const second = await patrol.runOnce();
  assert.deepEqual([second.raised, second.skipped], [1, 1]);
  assert.deepEqual(calls.at(-1).value, 500);
  // 다음 날(서울 자정 넘김): 다시 그날 첫 값으로 남긴다
  clock.now = new Date("2026-10-30T15:30:00Z");
  const third = await patrol.runOnce();
  assert.deepEqual([third.raised, third.skipped], [2, 0]);
  assert.equal(patrol.getStatus().passes, 3);
});

test("전투력 순찰: stat 응답에서 전투력 읽기", () => {
  assert.equal(readPower({ stat: [{ stat_name: "물리 공격력", stat_value: "54073" }, { stat_name: "전투력", stat_value: "14523198" }] }), 14523198);
  assert.equal(readPower({ stat: [] }), null);
  assert.equal(readPower(null), null);
});
