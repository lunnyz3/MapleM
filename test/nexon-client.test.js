const test = require("node:test");
const assert = require("node:assert/strict");
const { TtlLruCache, buildCacheKey, createNexonClient, defaultTtlMs } = require("../src/nexon/client");

function httpError(status, body = { error: { name: "OPENAPI00004", message: "Please input valid parameter" } }, headers = {}) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: body, headers }
  });
}

function createHarness({ responses, ...options } = {}) {
  let clock = Date.parse("2026-10-28T03:00:00Z");
  const calls = [];
  const sleeps = [];
  const queue = [...(responses || [])];
  const client = createNexonClient({
    baseUrl: "https://open.api.nexon.com",
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
    transport: async (url, params) => {
      calls.push({ url, params });
      const next = queue.length ? queue.shift() : { status: 200, data: { ok: calls.length } };
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
    ...options
  });
  return {
    client,
    calls,
    sleeps,
    advance: (ms) => {
      clock += ms;
    }
  };
}

test("buildCacheKey ignores parameter order and empty values", () => {
  assert.equal(
    buildCacheKey("/maplestorym/v1/id", { world_name: "스카니아", character_name: "a", page: undefined }),
    buildCacheKey("/maplestorym/v1/id", { character_name: "a", world_name: "스카니아" })
  );
});

test("defaultTtlMs keeps past-date rankings longer than today's", () => {
  const now = Date.parse("2026-10-28T03:00:00Z");
  assert.ok(
    defaultTtlMs("/maplestorym/v1/ranking/level", { date: "2026-10-27" }, now) >
      defaultTtlMs("/maplestorym/v1/ranking/level", { date: "2026-10-28" }, now)
  );
});

test("successful responses are cached until their TTL expires", async () => {
  const { client, calls, advance } = createHarness();
  const first = await client.request("/maplestorym/v1/character/basic", { ocid: "x" });
  const second = await client.request("/maplestorym/v1/character/basic", { ocid: "x" });

  assert.equal(calls.length, 1);
  assert.deepEqual(second.data, first.data);
  assert.equal(second.cached, true);
  assert.equal(first.endpoint, "https://open.api.nexon.com/maplestorym/v1/character/basic");

  advance(2 * 60 * 1000 + 1);
  await client.request("/maplestorym/v1/character/basic", { ocid: "x" });
  assert.equal(calls.length, 2);
});

test("concurrent identical requests share one Nexon call", async () => {
  const { client, calls } = createHarness();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => client.request("/maplestorym/v1/ranking/level", { date: "2026-10-27", page: 1 }))
  );
  assert.equal(calls.length, 1);
  assert.equal(new Set(results.map((r) => JSON.stringify(r.data))).size, 1);
  assert.equal(client.getStats().deduped, 4);
});

test("429 is retried with backoff and honours Retry-After", async () => {
  const { client, calls, sleeps } = createHarness({
    responses: [httpError(429, {}, { "retry-after": "2" }), httpError(429), { status: 200, data: { ok: true } }]
  });
  const result = await client.request("/maplestorym/v1/id", { character_name: "a", world_name: "스카니아" });

  assert.deepEqual(result.data, { ok: true });
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [2000, 800]);
});

test("5xx is retried but 400 is not", async () => {
  const server = createHarness({ responses: [httpError(500), { status: 200, data: { ok: 1 } }] });
  await server.client.request("/maplestorym/v1/character/stat", { ocid: "x" });
  assert.equal(server.calls.length, 2);

  const badRequest = createHarness({ responses: [httpError(400)] });
  await assert.rejects(badRequest.client.request("/maplestorym/v1/id", { character_name: "zz", world_name: "루나" }), (error) => error.response.status === 400);
  assert.equal(badRequest.calls.length, 1);
});

test("gives up after maxRetries and rethrows the original error", async () => {
  const { client, calls } = createHarness({ responses: [httpError(503), httpError(503), httpError(503), httpError(503)] });
  await assert.rejects(client.request("/maplestorym/v1/character/stat", { ocid: "x" }), (error) => error.response.status === 503);
  assert.equal(calls.length, 3);
});

test("client errors are cached briefly, rate-limit errors are not cached", async () => {
  const notFound = createHarness({ responses: [httpError(400)] });
  const params = { character_name: "없는캐릭", world_name: "루나" };
  await assert.rejects(notFound.client.request("/maplestorym/v1/id", params));
  await assert.rejects(notFound.client.request("/maplestorym/v1/id", params));
  assert.equal(notFound.calls.length, 1);
  notFound.advance(60 * 1000 + 1);
  await notFound.client.request("/maplestorym/v1/id", params);
  assert.equal(notFound.calls.length, 2);

  const limited = createHarness({ responses: [httpError(429), httpError(429), httpError(429)], maxRetries: 2 });
  await assert.rejects(limited.client.request("/maplestorym/v1/id", params));
  await limited.client.request("/maplestorym/v1/id", params);
  assert.equal(limited.calls.length, 4);
});

test("useCache: false always calls Nexon", async () => {
  const { client, calls } = createHarness();
  await client.request("/maplestorym/v1/character/basic", { ocid: "x" });
  await client.request("/maplestorym/v1/character/basic", { ocid: "x" }, { useCache: false });
  assert.equal(calls.length, 2);
});

test("concurrency limiter caps parallel Nexon calls", async () => {
  let active = 0;
  let peak = 0;
  const client = createNexonClient({
    baseUrl: "",
    maxConcurrency: 3,
    transport: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { status: 200, data: {} };
    }
  });
  await Promise.all(Array.from({ length: 10 }, (_, i) => client.request("/x", { i })));
  assert.equal(peak, 3);
});

test("TtlLruCache evicts least recently used entries by count and bytes", () => {
  const cache = new TtlLruCache({ maxEntries: 2, maxBytes: 100, now: () => 0 });
  cache.set("a", 1, 1000, 10);
  cache.set("b", 2, 1000, 10);
  cache.get("a");
  cache.set("c", 3, 1000, 10);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);

  cache.set("big", 4, 1000, 95);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("big"), 4);
  cache.set("huge", 5, 1000, 101);
  assert.equal(cache.get("huge"), undefined);
});
