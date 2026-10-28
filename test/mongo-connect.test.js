const test = require("node:test");
const assert = require("node:assert/strict");
const { connectMongo } = require("../src/config/mongo");

test("connectMongo skips connecting when no URI is configured", async (t) => {
  t.mock.method(console, "log", () => {});
  const connect = t.mock.fn(async () => {});
  assert.equal(await connectMongo({ uri: "", connect }), false);
  assert.equal(connect.mock.callCount(), 0);
});

test("connectMongo keeps retrying until the database becomes reachable", async (t) => {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  let calls = 0;
  const connect = async () => {
    calls += 1;
    if (calls < 3) {
      throw new Error("connect ECONNREFUSED 127.0.0.1:27027");
    }
  };
  const sleep = t.mock.fn(async () => {});

  assert.equal(await connectMongo({ uri: "mongodb://127.0.0.1:27027/maplem", connect, sleep, retryDelayMs: 5 }), true);
  assert.equal(calls, 3);
  assert.equal(sleep.mock.callCount(), 2);
});

test("connectMongo gives up after maxAttempts", async (t) => {
  t.mock.method(console, "error", () => {});
  const connect = t.mock.fn(async () => {
    throw new Error("down");
  });
  const sleep = t.mock.fn(async () => {});

  assert.equal(await connectMongo({ uri: "mongodb://x", connect, sleep, maxAttempts: 2 }), false);
  assert.equal(connect.mock.callCount(), 2);
  assert.equal(sleep.mock.callCount(), 1);
});
