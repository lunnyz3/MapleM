const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { env } = require("../src/config/env");
const { RequestLog } = require("../src/models/request-log.model");
const { saveRequestLog } = require("../src/services/maplestorym.service");

const sample = {
  characterName: "피카츄", worldName: "유니온", ocid: "fixture",
  endpoint: "https://open.api.nexon.com/maplestorym/v1/character/all",
  statusCode: 200, success: true, responseBody: { mode: "all", details: {} }
};
function database(t) {
  Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
  const oldThrottle = env.mongoLogThrottleMs;
  env.mongoLogThrottleMs = 0;
  t.after(() => { delete mongoose.connection.readyState; env.mongoLogThrottleMs = oldThrottle; });
  const find = t.mock.method(RequestLog, "findOne", () => ({ sort: () => ({ select: () => ({ lean: async () => ({ _id: "existing-daily" }) }) }) }));
  const replace = t.mock.method(RequestLog, "findOneAndReplace", async () => ({ _id: "existing-daily" }));
  const remove = t.mock.method(RequestLog, "deleteMany", async () => ({}));
  const create = t.mock.method(RequestLog, "create", async (entry) => ({ _id: "error-log", ...entry }));
  return { find, replace, remove, create };
}

test("both bot and website lookups update the same daily character snapshot", async (t) => {
  const { replace, create } = database(t);
  for (const mode of ["all", "page-data"]) {
    assert.ok(await saveRequestLog({ ...sample, responseBody: { mode, details: {} } }));
  }
  assert.equal(replace.mock.callCount(), 2);
  const [first, second] = replace.mock.calls.map((call) => call.arguments);
  assert.deepEqual(first[0], { _id: "existing-daily" });
  assert.deepEqual(second[0], first[0]);
  assert.equal(first[1].snapshotDate, second[1].snapshotDate);
  assert.match(first[1].snapshotDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(create.mock.callCount(), 0);
});

test("failed and partial lookups cannot replace or delete a successful daily snapshot", async (t) => {
  const { replace, remove, create } = database(t);
  for (const statusCode of [200, 404, 500]) {
    const result = await saveRequestLog({ ...sample, statusCode, success: false });
    assert.ok(result);
    assert.equal(result.snapshotDate, undefined, "error logs do not take the daily unique key");
  }
  assert.equal(replace.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
  assert.equal(create.mock.callCount(), 3);
});

test("a daily snapshot write failure is reported as unsaved", async (t) => {
  const { replace } = database(t);
  replace.mock.mockImplementation(async () => { throw new Error("fixture DB write failure"); });
  t.mock.method(console, "error", () => {});
  assert.equal(await saveRequestLog(sample), null);
});
