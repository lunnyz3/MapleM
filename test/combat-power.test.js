const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { CombatPowerObservation } = require("../src/models/combat-power-observation.model");
const { observeCombatPower, rankingObservedAt, clearCombatPowerMemory } = require("../src/services/combat-power.service");

const HOUR = 60 * 60 * 1000;
const base = new Date("2026-10-28T12:00:00+09:00");
const at = (hours) => new Date(base.getTime() + hours * HOUR);

function pretendMongoConnected(t) {
  Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
  t.after(() => {
    delete mongoose.connection.readyState;
  });
}

function mockFindOne(t, result) {
  return t.mock.method(CombatPowerObservation, "findOne", () => {
    const query = {
      sort: () => query,
      select: () => query,
      maxTimeMS: () => query,
      lean: async () => (typeof result === "function" ? result() : result)
    };
    return query;
  });
}

test.beforeEach(() => clearCombatPowerMemory());

test("rankingObservedAt maps a ranking date to 02:30 KST that day", () => {
  assert.equal(rankingObservedAt("2026-10-28").toISOString(), "2026-10-27T17:30:00.000Z");
  assert.equal(rankingObservedAt("not-a-date"), null);
  assert.equal(rankingObservedAt(""), null);
});

test("without MongoDB the highest value of the last 24 hours is kept in memory", async () => {
  const first = await observeCombatPower("ocid-a", [{ value: 1200000, source: "stat" }], { now: at(0) });
  assert.deepEqual(first, { value: 1200000, observedAt: at(0).toISOString() });

  // A farming preset later in the day shows less; the earlier boss value stays.
  const farming = await observeCombatPower("ocid-a", [{ value: 400000, source: "stat" }], { now: at(5) });
  assert.deepEqual(farming, { value: 1200000, observedAt: at(0).toISOString() });

  // More than 24 hours after the high value it drops out of the window.
  const nextDay = await observeCombatPower("ocid-a", [{ value: 500000, source: "stat" }], { now: at(25) });
  assert.deepEqual(nextDay, { value: 500000, observedAt: at(25).toISOString() });
});

test("a ranking row counts as observed at 02:30 KST of its date", async () => {
  const result = await observeCombatPower(
    "ocid-b",
    [
      { value: 300000, source: "stat" },
      { value: 900000, observedAt: rankingObservedAt("2026-10-28"), source: "ranking" }
    ],
    { now: at(0) }
  );
  assert.deepEqual(result, { value: 900000, observedAt: "2026-10-27T17:30:00.000Z" });

  // Yesterday's row is older than 24 hours at noon, so the current value wins.
  clearCombatPowerMemory();
  const stale = await observeCombatPower(
    "ocid-b",
    [
      { value: 300000, source: "stat" },
      { value: 900000, observedAt: rankingObservedAt("2026-10-27"), source: "ranking" }
    ],
    { now: at(0) }
  );
  assert.deepEqual(stale, { value: 300000, observedAt: at(0).toISOString() });
});

test("falls back to the current value, or nulls when nothing was observed", async () => {
  assert.deepEqual(await observeCombatPower("", [{ value: 777, source: "stat" }], { now: at(0) }), {
    value: 777,
    observedAt: at(0).toISOString()
  });
  assert.deepEqual(await observeCombatPower("ocid-c", [{ value: null, source: "stat" }, null], { now: at(0) }), {
    value: null,
    observedAt: null
  });
});

test("a higher value stored in MongoDB is returned and new observations are written", async (t) => {
  pretendMongoConnected(t);
  const updateOne = t.mock.method(CombatPowerObservation, "updateOne", async () => ({ acknowledged: true }));
  const findOne = mockFindOne(t, { value: 2000000, observedAt: at(-3), source: "stat" });

  const result = await observeCombatPower(
    "ocid-d",
    [
      { value: 1500000, source: "stat" },
      { value: 1800000, observedAt: rankingObservedAt("2026-10-28"), source: "ranking" }
    ],
    { now: at(0), waitForWrites: true }
  );

  assert.deepEqual(result, { value: 2000000, observedAt: at(-3).toISOString() });
  assert.equal(findOne.mock.callCount(), 1);
  assert.equal(updateOne.mock.callCount(), 2);
  const [statFilter, statUpdate, statOptions] = updateOne.mock.calls[0].arguments;
  assert.equal(statFilter.ocid, "ocid-d");
  assert.equal(statFilter.value, 1500000);
  assert.deepEqual(statUpdate, { $max: { observedAt: at(0) } });
  assert.equal(statOptions.upsert, true);
  const [rankingFilter, rankingUpdate] = updateOne.mock.calls[1].arguments;
  assert.deepEqual(rankingFilter, { ocid: "ocid-d", source: "ranking", observedAt: rankingObservedAt("2026-10-28") });
  assert.deepEqual(rankingUpdate, { $set: { value: 1800000 } });
});

test("MongoDB read and write failures never fail the lookup", async (t) => {
  pretendMongoConnected(t);
  t.mock.method(console, "error", () => {});
  t.mock.method(CombatPowerObservation, "updateOne", async () => {
    throw new Error("connection reset");
  });
  mockFindOne(t, () => {
    throw new Error("connection reset");
  });

  const result = await observeCombatPower("ocid-e", [{ value: 650000, source: "stat" }], {
    now: at(0),
    waitForWrites: true
  });
  assert.deepEqual(result, { value: 650000, observedAt: at(0).toISOString() });
});
