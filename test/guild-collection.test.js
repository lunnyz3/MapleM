const test = require("node:test");
const assert = require("node:assert/strict");
const { createGuildCollector } = require("../src/services/guild-collection.service");

function harness(overrides = {}) {
  let clock = Date.parse("2026-10-28T11:00:00Z");
  const collected = [];
  const listings = [];
  const worker = createGuildCollector({
    memberDelayMs: 0,
    now: () => clock,
    logger: { info() {}, warn() {} },
    listSavedToday: async (job) => { listings.push(job); return []; },
    collectMember: async (member) => { collected.push(member); return true; },
    ...overrides
  });
  return { worker, collected, listings, advance: (ms) => { clock += ms; } };
}
const input = (members = ["A", "B", "C"], extra = {}) => ({ worldName: "유니온", guildName: "길드", members, triggeredBy: "A", ...extra });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("returns queued immediately, de-duplicates the roster and skips today's DB snapshots", async () => {
  const h = harness({ listSavedToday: async () => ["A", "C"] });
  const result = h.worker.enqueue(input(["A", "B", "C", "B", null, "", " D "]));
  assert.equal(result.status, "queued");
  assert.equal(result.total, 4);
  assert.equal(h.collected.length, 0, "collection must not delay the foreground response");
  await h.worker.whenIdle();
  assert.deepEqual(h.collected.map((member) => member.characterName), ["B", "D"]);
  const status = h.worker.getStatus("유니온", "길드");
  assert.equal(status.status, "completed");
  assert.equal(status.saved, 2);
  assert.equal(status.skipped, 2);
  assert.equal(status.remaining, 0);
});

test("repeated searches reuse one job, including while it is running", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const seen = [];
  const h = harness({ collectMember: async (member) => { seen.push(member.characterName); await gate; return true; } });
  h.worker.enqueue(input());
  await tick();
  const status = h.worker.enqueue(input(undefined, { triggeredBy: "C" }));
  assert.equal(status.status, "running");
  release();
  await h.worker.whenIdle();
  assert.deepEqual(seen, ["B"], "C was saved by a foreground search before its turn");
  assert.equal(h.listings.length, 1);
  assert.equal(h.worker.enqueue(input()).status, "completed");
  await h.worker.whenIdle();
  assert.equal(h.listings.length, 1);
});

test("overlapping guild rosters share fresh members but worlds stay separate", async () => {
  const h = harness();
  h.worker.enqueue(input(["A", "B"]));
  await h.worker.whenIdle();
  h.worker.enqueue(input(["B", "C"], { guildName: "다른길드", triggeredBy: "C" }));
  h.worker.enqueue(input(["A", "B"], { worldName: "스카니아" }));
  await h.worker.whenIdle();
  assert.deepEqual(h.collected, [
    { worldName: "유니온", characterName: "B" },
    { worldName: "스카니아", characterName: "B" }
  ]);
});

test("a failed member does not stop other members and is retried only after the cooldown", async () => {
  let failedOnce = false;
  const seen = [];
  const h = harness({ collectMember: async ({ characterName }) => {
    seen.push(characterName);
    if (characterName === "B" && !failedOnce) { failedOnce = true; throw new Error("fixture timeout"); }
    return true;
  } });
  h.worker.enqueue(input());
  await h.worker.whenIdle();
  assert.equal(h.worker.getStatus("유니온", "길드").status, "partial");
  h.worker.enqueue(input());
  await h.worker.whenIdle();
  assert.deepEqual(seen, ["B", "C"]);
  h.advance(5 * 60 * 1000);
  h.worker.enqueue(input());
  await h.worker.whenIdle();
  assert.deepEqual(seen, ["B", "C", "B"]);
  assert.equal(h.worker.getStatus("유니온", "길드").status, "completed");
});

test("unavailable storage prevents work, and failed initial DB reads make no Nexon calls", async () => {
  const unavailable = harness({ isAvailable: () => false });
  assert.equal(unavailable.worker.enqueue(input()).status, "unavailable");
  await unavailable.worker.whenIdle();
  assert.equal(unavailable.collected.length, 0);
  const failedRead = harness({ listSavedToday: async () => { throw new Error("fixture DB failure"); } });
  failedRead.worker.enqueue(input());
  await failedRead.worker.whenIdle();
  assert.equal(failedRead.collected.length, 0);
  assert.equal(failedRead.worker.getStatus("유니온", "길드").status, "failed");
});

test("losing DB write access stops before querying the remaining members", async () => {
  let available = true;
  const seen = [];
  const h = harness({
    isAvailable: () => available,
    collectMember: async ({ characterName }) => { seen.push(characterName); available = false; return true; }
  });
  h.worker.enqueue(input());
  await h.worker.whenIdle();
  assert.deepEqual(seen, ["B"]);
  const status = h.worker.getStatus("유니온", "길드");
  assert.equal(status.status, "failed");
  assert.equal(status.remaining, 1);
});

test("one worker handles all guilds sequentially", async () => {
  let active = 0;
  let peak = 0;
  const h = harness({ collectMember: async () => {
    active += 1; peak = Math.max(peak, active);
    await tick(); active -= 1;
    return true;
  } });
  h.worker.enqueue(input(["A", "B"]));
  h.worker.enqueue(input(["X", "Y"], { guildName: "두번째", triggeredBy: "X" }));
  await h.worker.whenIdle();
  assert.equal(peak, 1);
  assert.equal(h.worker.getStatus("유니온", "두번째").status, "completed");
});

test("the daily key follows KST midnight and permits a new job on the next date", async () => {
  const h = harness();
  h.worker.enqueue(input(["A", "B"]));
  await h.worker.whenIdle();
  h.advance(13 * 60 * 60 * 1000); // KST next morning.
  assert.equal(h.worker.getStatus("유니온", "길드").status, "not_queued");
  h.worker.enqueue(input(["A", "B"]));
  await h.worker.whenIdle();
  assert.equal(h.collected.length, 2);
  assert.equal(h.worker.getStatus("유니온", "길드").dateKst, "2026-10-29");
});

test("an old queued job expires when the KST date changes instead of saving it under the wrong day", async () => {
  let h;
  const seen = [];
  h = harness({ collectMember: async ({ characterName }) => { seen.push(characterName); h.advance(24 * 60 * 60 * 1000); return true; } });
  h.worker.enqueue(input());
  await h.worker.whenIdle();
  assert.deepEqual(seen, ["B"]);
});

test("empty or invalid rosters schedule no collection", async () => {
  const h = harness();
  assert.equal(h.worker.enqueue(input([null, "", " ", 1])).status, "no_members");
  await h.worker.whenIdle();
  assert.equal(h.collected.length, 0);
});
