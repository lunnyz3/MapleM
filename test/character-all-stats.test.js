const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Exercise the actual /all controller against captured Nexon responses, without network
// or database writes. Each test file runs in its own process.
const service = require("../src/services/maplestorym.service");
const statsModule = require("../src/domain/stats");
const { env } = require("../src/config/env");
const mongoose = require("mongoose");
const { RequestLog } = require("../src/models/request-log.model");
env.nexonApiKey = "fixture-only";
env.guildCollectionEnabled = false;
let fixture;
let engineFailure = false;
let saveSucceeds = false;
const buildStats = statsModule.buildCharacterStats;
statsModule.buildCharacterStats = (...args) => {
  if (engineFailure) throw new Error("fixture engine failure");
  return buildStats(...args);
};
const result = (data) => ({ data, statusCode: 200, endpoint: "fixture" });
service.getCharacterOcid = async () => result({ ocid: "fixture-ocid" });
service.getCharacterByOcid = async (endpoint) => {
  const key = Object.keys(fixture.details).find(
    (name) => endpoint.endsWith(`/${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`)
  );
  assert.ok(key, `unmapped endpoint ${endpoint}`);
  return result(fixture.details[key].data);
};
service.getGuildId = async () => result(fixture.details.guildId.data);
service.getGuildBasic = async () => result(fixture.details.guildBasic.data);
service.saveRequestLog = async () => saveSucceeds ? { _id: "fixture-snapshot" } : null;
const { getAllCharacterDetails, guildCollector, getGuildCollectionStatus } = require("../src/controllers/maplestorym.controller");

const fixtureDir = path.join(__dirname, "fixtures/characters");
const loadFixture = (file) => JSON.parse(fs.readFileSync(path.join(fixtureDir, file), "utf8"));
async function request(includeStats, includePower) {
  let body;
  const req = { query: { world_name: fixture.world, character_name: fixture.name, include_stats: includeStats, include_combat_power: includePower } };
  const res = {
    status(code) { assert.equal(code, 200); return this; },
    json(value) { body = value; return value; }
  };
  await getAllCharacterDetails(req, res);
  return body;
}

for (const file of fs.readdirSync(fixtureDir).filter((name) => name.endsWith(".json"))) {
  test(`/all opt-in stats match the website for ${file}`, async () => {
    fixture = loadFixture(file);
    const body = await request("1");
    const expected = buildStats(fixture.details);
    assert.equal(body.ok, true);
    assert.equal(body.summary.failureCount, 0);
    for (const key of ["majorStats", "majorStatsCurrent", "statSetting", "majorStatOrder"]) {
      assert.deepEqual(body.stats[key], expected[key], key);
    }
    assert.equal(body.stats.attackType, expected.attackType);
    assert.equal(body.stats.result, undefined, "internal engine state is not exposed");
    assert.equal(body.stats.manualApplied, undefined);
  });
}

test("/all keeps the original response unless include_stats=1", async () => {
  fixture = loadFixture("유니온-피카츄.json");
  for (const optIn of [undefined, "0", "true"]) {
    const body = await request(optIn);
    assert.equal(body.ok, true);
    assert.equal(body.stats, undefined);
    assert.equal(body.combatPowerHistory, undefined);
    assert.equal(body.meta.aggregateSaved, false);
    assert.deepEqual(body.details.basic.data, fixture.details.basic.data);
  }
});

test("/all reports whether the daily DB snapshot was saved", async (t) => {
  fixture = loadFixture("유니온-피카츄.json");
  Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
  saveSucceeds = true;
  t.after(() => { delete mongoose.connection.readyState; saveSucceeds = false; });
  const body = await request();
  assert.equal(body.meta.mongoConnected, true);
  assert.equal(body.meta.aggregateSaved, true);
  assert.ok(Number.isFinite(Date.parse(body.meta.dataTimestamp)));
});

test("a successful foreground lookup queues its own guild roster after saving", async (t) => {
  fixture = loadFixture("유니온-피카츄.json");
  Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
  saveSucceeds = true;
  env.guildCollectionEnabled = true;
  t.after(() => { delete mongoose.connection.readyState; saveSucceeds = false; env.guildCollectionEnabled = false; });
  const enqueue = t.mock.method(guildCollector, "enqueue", () => ({ status: "queued" }));
  const body = await request();
  assert.equal(body.meta.aggregateSaved, true);
  assert.equal(body.meta.guildCollection.status, "queued");
  assert.equal(enqueue.mock.callCount(), 1);
  const input = enqueue.mock.calls[0].arguments[0];
  assert.equal(input.worldName, fixture.world);
  assert.equal(input.guildName, fixture.details.guildBasic.data.guild_name);
  assert.equal(input.triggeredBy, fixture.name);
  assert.deepEqual(input.members, fixture.details.guildBasic.data.guild_member.map((member) => member.character_name));
});

test("unsaved foreground data never starts a guild collection", async (t) => {
  fixture = loadFixture("유니온-피카츄.json");
  env.guildCollectionEnabled = true;
  t.after(() => { env.guildCollectionEnabled = false; });
  const enqueue = t.mock.method(guildCollector, "enqueue", () => { throw new Error("must not enqueue"); });
  const body = await request();
  assert.equal(body.meta.guildCollection.status, "unavailable");
  assert.equal(enqueue.mock.callCount(), 0);
});

test("guild collection progress accepts world aliases and rejects incomplete requests", (t) => {
  const get = t.mock.method(guildCollector, "getStatus", () => ({ status: "running", saved: 3 }));
  let body;
  let status;
  const res = { status(code) { status = code; return this; }, json(value) { body = value; } };
  getGuildCollectionStatus({ query: { world_name: "Union", guild_name: "길드" } }, res);
  assert.equal(body.collection.saved, 3);
  assert.deepEqual(get.mock.calls[0].arguments, ["유니온", "길드"]);
  getGuildCollectionStatus({ query: { world_name: "없는월드" } }, res);
  assert.equal(status, 400);
});

test("/all returns the saved 24-hour maximum when only combat power is requested", async (t) => {
  fixture = loadFixture("유니온-피카츄.json");
  Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
  t.after(() => { delete mongoose.connection.readyState; });
  t.mock.method(RequestLog, "find", () => ({ select: () => ({ lean: async () => [{
    createdAt: new Date(Date.now() - 3600000), statusCode: 200, success: true,
    responseBody: { ranking: [{ character_name: "피카츄", world_name: "Union", character_combat_power: 192215561 }] }
  }] }) }));
  const body = await request(undefined, "1");
  assert.equal(body.ok, true);
  assert.equal(body.stats, undefined);
  assert.equal(body.combatPowerHistory.value, 192215561);
  assert.equal(body.combatPowerHistory.status, "ok");
});

test("a stat-engine error preserves raw details and reports no fabricated stats", async (t) => {
  fixture = loadFixture("유니온-피카츄.json");
  engineFailure = true;
  t.after(() => { engineFailure = false; });
  t.mock.method(console, "error", () => {});
  const body = await request("1");
  assert.equal(body.ok, true);
  assert.deepEqual(body.details.basic.data, fixture.details.basic.data);
  assert.deepEqual(body.stats.majorStats, {});
  assert.equal(body.stats.statSetting, null);
});
