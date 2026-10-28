const test = require("node:test");
const assert = require("node:assert/strict");
const { createNexonClient } = require("../src/nexon/client");
const { createRankingChangeService, annotateRankChange } = require("../src/services/ranking-change.service");
const { createRankingV2Handler } = require("../src/controllers/ranking-v2.controller");

const NOW = Date.parse("2026-10-28T03:00:00Z"); // 12:00 KST
const PAGE_SIZE = 200;

function httpError(status, message) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { error: { name: "OPENAPI00004", message } }, headers: {} }
  });
}

// days: { "YYYY-MM-DD": [{ world, name }] in overall order } or an Error to throw for that date.
function createHarness(days, { kind = "character" } = {}) {
  const calls = [];
  const client = createNexonClient({
    baseUrl: "",
    now: () => NOW,
    sleep: async () => {},
    random: () => 0,
    transport: async (url, params) => {
      calls.push({ url, ...params });
      const day = days[params.date];
      if (day instanceof Error) {
        throw day;
      }
      const ordered = day || [];
      const worldCounts = new Map();
      const rows = ordered.map((entry, index) => {
        const worldRank = (worldCounts.get(entry.world) || 0) + 1;
        worldCounts.set(entry.world, worldRank);
        const nameField = kind === "guild" ? { guild_name: entry.name } : { character_name: entry.name };
        return { date: params.date, ranking: index + 1, world_ranking: worldRank, world_name: entry.world, ...nameField };
      });
      const filtered = params.world_name ? rows.filter((row) => row.world_name === params.world_name) : rows;
      const start = (params.page - 1) * PAGE_SIZE;
      return { status: 200, data: { ranking: filtered.slice(start, start + PAGE_SIZE) } };
    }
  });
  const service = createRankingChangeService({ fetchRanking: (endpoint, params) => client.request(endpoint, params), now: () => NOW });
  return { service, calls };
}

const people = (names, world = "스카니아") => names.map((name) => ({ world, name }));
const byName = (payload) => Object.fromEntries(payload.rows.map((row) => [row.character_name ?? row.guild_name, row]));

test("rise, fall and new entries against the previous day", async () => {
  const { service } = createHarness({
    "2026-10-26": people(["A", "B", "C", "D"]),
    "2026-10-27": people(["B", "A", "E", "C"])
  });
  const payload = await service.getRankingWithChange({ type: "level", date: "2026-10-27", page: 1 });
  assert.equal(payload.ok, true);
  assert.equal(payload.date, "2026-10-27");
  assert.equal(payload.previousDate, "2026-10-26");
  assert.equal(payload.worldName, null);
  const rows = byName(payload);
  assert.deepEqual(
    [rows.B.rank, rows.B.previousRank, rows.B.rankChange, rows.B.isNew],
    [1, 2, 1, false]
  );
  assert.deepEqual([rows.A.rank, rows.A.previousRank, rows.A.rankChange], [2, 1, -1]);
  assert.deepEqual([rows.E.previousRank, rows.E.rankChange, rows.E.isNew], [null, null, true]);
  assert.deepEqual([rows.C.rank, rows.C.previousRank, rows.C.rankChange], [4, 3, -1]);
  assert.equal(rows.B.date, "2026-10-27", "Nexon row fields are kept");
});

test("no previous data: previousDate null, nothing marked new", async () => {
  const { service, calls } = createHarness({ "2026-10-27": people(["A", "B"]) });
  const payload = await service.getRankingWithChange({ type: "combat-power", date: "2026-10-27", page: 1 });
  assert.equal(payload.previousDate, null);
  for (const row of payload.rows) {
    assert.equal(row.previousRank, null);
    assert.equal(row.rankChange, null);
    assert.equal(row.isNew, false);
  }
  // Searched back 7 days (pages 1 and 2 each), then gave up.
  const previousDates = new Set(calls.filter((call) => call.date !== "2026-10-27").map((call) => call.date));
  assert.equal(previousDates.size, 7);
  assert.ok(!previousDates.has("2026-10-19"));
});

test("previous day empty: compares with the latest earlier day with data", async () => {
  const { service } = createHarness({
    "2026-10-23": people(["B", "A"]),
    "2026-10-27": people(["A", "B"])
  });
  const payload = await service.getRankingWithChange({ type: "level", date: "2026-10-27", page: 1 });
  assert.equal(payload.previousDate, "2026-10-23");
  assert.equal(byName(payload).A.rankChange, 1);
});

test("world filter ranks by world_ranking on both days", async () => {
  const mixed = (order) => order.map(([world, name]) => ({ world, name }));
  const { service, calls } = createHarness({
    "2026-10-26": mixed([["루나", "L1"], ["스카니아", "S1"], ["스카니아", "S2"], ["루나", "L2"]]),
    "2026-10-27": mixed([["스카니아", "S2"], ["루나", "L1"], ["루나", "L2"], ["스카니아", "S1"]])
  });
  const payload = await service.getRankingWithChange({ type: "level", date: "2026-10-27", page: 1, worldName: "스카니아" });
  assert.equal(payload.worldName, "스카니아");
  assert.ok(calls.every((call) => call.world_name === "스카니아"));
  const rows = byName(payload);
  assert.deepEqual([rows.S2.ranking, rows.S2.rank, rows.S2.previousRank, rows.S2.rankChange], [1, 1, 2, 1]);
  assert.deepEqual([rows.S1.ranking, rows.S1.rank, rows.S1.previousRank, rows.S1.rankChange], [4, 2, 1, -1]);
});

test("guild ranking matches on (world_name, guild_name)", async () => {
  const guilds = (order) => order.map(([world, name]) => ({ world, name }));
  const { service } = createHarness(
    {
      "2026-10-26": guilds([["루나", "광장"], ["스카니아", "Castle"], ["스카니아", "광장"]]),
      "2026-10-27": guilds([["스카니아", "광장"], ["루나", "광장"], ["스카니아", "Castle"]])
    },
    { kind: "guild" }
  );
  const payload = await service.getRankingWithChange({ type: "sharenian-waterway", date: "2026-10-27", page: 1 });
  const [scania, luna, castle] = payload.rows;
  assert.deepEqual([scania.guild_name, scania.world_name, scania.previousRank, scania.rankChange], ["광장", "스카니아", 3, 2]);
  assert.deepEqual([luna.world_name, luna.previousRank, luna.rankChange], ["루나", 1, -1]);
  assert.deepEqual([castle.previousRank, castle.rankChange], [2, -1]);
});

test("guild ranking: an empty requested day falls back to the latest day with data", async () => {
  const guilds = (names) => names.map((name) => ({ world: "루나", name }));
  const { service } = createHarness(
    { "2026-10-24": guilds(["X", "Y"]), "2026-10-25": guilds(["Y", "X"]) },
    { kind: "guild" }
  );
  const payload = await service.getRankingWithChange({ type: "sharenian-battlefield", date: "2026-10-28", page: 1 });
  assert.equal(payload.date, "2026-10-25");
  // Battlefield seasons run four weeks apart, so no rank change is reported.
  assert.equal(payload.previousDate, null);
  assert.equal(byName(payload).Y.rankChange, null);
  assert.equal(byName(payload).Y.isNew, false);
});

test("page boundary: previous ranks come from the neighbouring pages", async () => {
  const names = Array.from({ length: 800 }, (_, index) => `C${index + 1}`);
  const today = [...names];
  // Yesterday: C250 was 150th (page 1), C350 was 450th (page 3), C300 was 700th (page 4).
  const yesterday = names.filter((name) => !["C250", "C350", "C300"].includes(name));
  yesterday.splice(149, 0, "C250");
  yesterday.splice(449, 0, "C350");
  yesterday.splice(699, 0, "C300");
  const { service, calls } = createHarness({ "2026-10-26": people(yesterday), "2026-10-27": people(today) });

  const payload = await service.getRankingWithChange({ type: "level", date: "2026-10-27", page: 2 });
  assert.equal(payload.rows.length, 200);
  const rows = byName(payload);
  assert.deepEqual([rows.C250.rank, rows.C250.previousRank, rows.C250.rankChange], [250, 150, -100]);
  assert.deepEqual([rows.C350.rank, rows.C350.previousRank, rows.C350.rankChange], [350, 450, 100]);
  assert.deepEqual([rows.C300.previousRank, rows.C300.isNew], [null, true]);
  const previousPages = calls.filter((call) => call.date === "2026-10-26").map((call) => call.page).sort();
  assert.deepEqual(previousPages, [1, 2, 3]);
});

test("today before aggregation moves to yesterday", async () => {
  const { service } = createHarness({
    "2026-10-28": httpError(400, "Please wait until the data is ready"),
    "2026-10-26": people(["A", "B"]),
    "2026-10-27": people(["B", "A"])
  });
  const payload = await service.getRankingWithChange({ type: "level", page: 1 });
  assert.equal(payload.date, "2026-10-27");
  assert.equal(payload.previousDate, "2026-10-26");
  assert.equal(byName(payload).B.rankChange, 1);
});

test("responses are cached briefly", async () => {
  const { service, calls } = createHarness({ "2026-10-26": people(["A"]), "2026-10-27": people(["A"]) });
  await service.getRankingWithChange({ type: "union", date: "2026-10-27", page: 1 });
  const callCount = calls.length;
  const again = await service.getRankingWithChange({ type: "union", date: "2026-10-27", page: 1 });
  assert.equal(calls.length, callCount);
  assert.equal(again.rows[0].rankChange, 0);
});

test("annotateRankChange keeps the best rank for a duplicated key", () => {
  const rows = annotateRankChange(
    [{ ranking: 3, world_name: "루나", character_name: "A" }],
    [{ ranking: 5, world_name: "루나", character_name: "A" }, { ranking: 4, world_name: "루나", character_name: "A" }],
    { kind: "character", worldName: "" }
  );
  assert.equal(rows[0].previousRank, 4);
});

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test("handler validates the query and forwards Nexon errors", async () => {
  const seen = [];
  const handler = createRankingV2Handler({
    hasApiKey: () => true,
    service: {
      getRankingWithChange: async (query) => {
        seen.push(query);
        if (query.page === 2) throw httpError(400, "Please input valid parameter");
        return { ok: true, ...query };
      }
    }
  });
  const run = async (type, query) => {
    const res = fakeResponse();
    await handler({ params: { type }, query }, res);
    return res;
  };

  assert.equal((await run("dojang", {})).statusCode, 404);
  assert.equal((await run("level", { page: "51" })).statusCode, 400);
  assert.equal((await run("level", { date: "2025-01-01" })).statusCode, 400);
  assert.equal((await run("level", { world_name: "없는월드" })).statusCode, 400);

  const ok = await run("level", { date: "2026.10.27", world_name: "scania" });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(seen.at(-1), { type: "level", date: "2026-10-27", page: 1, worldName: "스카니아" });

  const failed = await run("level", { date: "2026-10-27", page: "2" });
  assert.equal(failed.statusCode, 400);
  assert.equal(failed.body.ok, false);
});
