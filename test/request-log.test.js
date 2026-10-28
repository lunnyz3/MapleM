const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { RequestLog } = require("../src/models/request-log.model");
const { saveRequestLog, canSaveRequestLogs } = require("../src/services/maplestorym.service");

const sampleEntry = {
  characterName: "테스트",
  worldName: "스카니아",
  ocid: "ocid-test",
  endpoint: "https://open.api.nexon.com/maplestorym/v1/ranking/level",
  statusCode: 200,
  success: true,
  responseBody: { ranking: [] }
};

function pretendMongoConnected(t) {
  Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
  t.after(() => {
    delete mongoose.connection.readyState;
  });
}

test("saveRequestLog skips writes when MongoDB is not connected", async () => {
  assert.equal(canSaveRequestLogs(), false);
  assert.equal(await saveRequestLog(sampleEntry), null);
});

test("saveRequestLog swallows non-quota write errors without suspending later writes", async (t) => {
  pretendMongoConnected(t);
  assert.equal(canSaveRequestLogs(), true);
  t.mock.method(console, "error", () => {});
  const findOne = t.mock.method(RequestLog, "findOne", () => {
    throw new Error("connection reset");
  });

  assert.equal(await saveRequestLog(sampleEntry), null);
  assert.equal(await saveRequestLog(sampleEntry), null);
  assert.equal(findOne.mock.callCount(), 2);
});

test("saveRequestLog never throws on Atlas quota errors and pauses further writes", async (t) => {
  pretendMongoConnected(t);
  t.mock.method(console, "error", () => {});
  const quotaError = new Error(
    "you are over your space quota, using 512 MB of 512 MB. Writes are blocked on your cluster."
  );
  const findOne = t.mock.method(RequestLog, "findOne", () => {
    throw quotaError;
  });

  assert.equal(await saveRequestLog(sampleEntry), null);
  assert.equal(await saveRequestLog(sampleEntry), null);
  assert.equal(findOne.mock.callCount(), 1, "writes should be suspended after a quota error");
  assert.equal(canSaveRequestLogs(), false, "background collection must pause too");
});
