const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { RequestLog } = require("../src/models/request-log.model");
const { resolveStoredCombatPowerByOcid } = require("../src/controllers/maplestorym.controller");

const now = new Date("2026-10-28T12:00:00Z");
const query = { characterName: "피카츄", worldNameCanonical: "유니온", now };
const stat = (value) => ({ stat: [{ stat_name: "전투력", stat_value: value }] });
const doc = (hoursAgo, responseBody, extra = {}) => ({
  createdAt: new Date(now - hoursAgo * 3600000),
  statusCode: 200, success: true, responseBody, ...extra
});

function useDatabase(t, docs) {
  Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
  t.after(() => { delete mongoose.connection.readyState; });
  const select = t.mock.fn(() => ({ lean: async () => docs }));
  const find = t.mock.method(RequestLog, "find", () => ({ select }));
  return { find, select };
}

test("stored official ranking and current API values compete, estimates never do", async (t) => {
  useDatabase(t, [
    doc(1, { details: { stat: { ok: true, data: stat("34,344,107") } }, stats: { statSetting: { combatPower: { boss: 999999999 } } } }),
    doc(4, { ranking: [
      { character_name: "다른사람", world_name: "Union", character_combat_power: 999999999 },
      { character_name: "피카츄", world_name: "Union", character_combat_power: 192215561 },
      { character_name: "피카츄", world_name: "Scania", character_combat_power: 999999999 }
    ] })
  ]);
  const result = await resolveStoredCombatPowerByOcid("ocid-test", query);
  assert.equal(result.value, 192215561);
  assert.equal(result.status, "ok");
  assert.equal(result.windowHours, 24);
  assert.equal(result.observedAt, "2026-10-28T08:00:00.000Z");
});

test("finds the highest value across all saved shapes, rather than the newest log", async (t) => {
  useDatabase(t, [
    doc(1, stat("10,000")),
    doc(5, { details: { stat: { ok: true, data: stat(50000) } } }),
    doc(6, { tabs: { exp: { stat: { ok: true, data: stat(60000) } } } }),
    doc(7, { profile: { combatPower: { current: 70000, official: { value: 80000 } } } })
  ]);
  assert.equal((await resolveStoredCombatPowerByOcid("ocid-test", query)).value, 80000);
});

test("the rolling 24-hour window excludes stale and future records", async (t) => {
  useDatabase(t, [doc(24, stat(50)), doc(24.001, stat(1000)), doc(-1, stat(2000))]);
  assert.equal((await resolveStoredCombatPowerByOcid("ocid-test", query)).value, 50);
});

test("daily snapshots use updatedAt, falling back to createdAt for legacy documents", async (t) => {
  const { find } = useDatabase(t, [
    doc(48, stat(200), { updatedAt: new Date(now - 3600000) }),
    doc(2, stat(100)),
    doc(1, stat(999), { updatedAt: new Date(now - 48 * 3600000) })
  ]);
  const result = await resolveStoredCombatPowerByOcid("ocid-test", query);
  assert.equal(result.value, 200);
  assert.equal(result.observedAt, "2026-10-28T11:00:00.000Z");
  assert.equal(find.mock.calls[0].arguments[0].ocid, "ocid-test");
  assert.deepEqual(find.mock.calls[0].arguments[0].$or[0].updatedAt, {
    $gte: new Date("2026-10-27T12:00:00Z"), $lte: now
  });
});

test("valid stat data survives unrelated aggregate failures; failed stat data is ignored", async (t) => {
  useDatabase(t, [
    doc(1, { details: { stat: { ok: true, data: stat(100) } } }, { success: false }),
    doc(1, { details: { stat: { ok: false, data: stat(999) } } }),
    doc(1, stat(999), { success: false }),
    doc(1, stat(999), { statusCode: 500 })
  ]);
  assert.equal((await resolveStoredCombatPowerByOcid("ocid-test", query)).value, 100);
});

test("empty, malformed and non-positive records do not become a fake zero", async (t) => {
  useDatabase(t, [doc(1, stat("-")), doc(1, stat(0)), doc(1, stat(-10)), doc(1, {}), doc(1, stat(null))]);
  assert.deepEqual(await resolveStoredCombatPowerByOcid("ocid-test", query), {
    windowHours: 24, value: null, observedAt: null, status: "no_records"
  });
});

test("DB failures preserve the character response and report unavailable history", async (t) => {
  useDatabase(t, []);
  t.mock.method(RequestLog, "find", () => { throw new Error("fixture DB failure"); });
  t.mock.method(console, "error", () => {});
  const result = await resolveStoredCombatPowerByOcid("ocid-test", query);
  assert.equal(result.value, null);
  assert.equal(result.status, "unavailable");
});

test("disconnected DBs are not queried", async (t) => {
  const find = t.mock.method(RequestLog, "find", () => { throw new Error("should not query"); });
  const result = await resolveStoredCombatPowerByOcid("ocid-test", query);
  assert.equal(result.value, null);
  assert.equal(result.status, "unavailable");
  assert.equal(find.mock.callCount(), 0);
});
