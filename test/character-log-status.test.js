const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { RequestLog } = require("../src/models/request-log.model");
const { getCharacterLogStatus } = require("../src/controllers/maplestorym.controller");

test("storage status includes bot /all snapshots as well as website /page-data snapshots", async (t) => {
  Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
  t.after(() => { delete mongoose.connection.readyState; });
  const updatedAt = new Date("2026-10-28T12:00:00Z");
  const find = t.mock.method(RequestLog, "findOne", () => ({ sort: () => ({ select: () => ({ lean: async () => ({
    createdAt: new Date("2026-10-28T02:00:00Z"), updatedAt,
    responseBody: { mode: "all", details: { union: {}, guild: {}, androidEquipment: {} } }
  }) }) }) }));
  const count = t.mock.method(RequestLog, "countDocuments", async () => 2);
  let body;
  await getCharacterLogStatus({ query: { ocid: "fixture" } }, { json: (value) => { body = value; } });
  assert.equal(body.mongoConnected, true);
  assert.equal(body.latestAggregateLogAt, updatedAt.toISOString());
  assert.equal(body.aggregateCount, 2);
  const filter = find.mock.calls[0].arguments[0];
  assert.deepEqual(filter["responseBody.mode"], { $in: ["all", "page-data"] });
  assert.equal(filter.success, true);
  assert.deepEqual(count.mock.calls[0].arguments[0], filter);
});
