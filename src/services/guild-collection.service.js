// One background worker for guilds discovered by a foreground character lookup.
// Members are fetched directly; a collected member never enqueues another guild.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const kstDate = (timestamp) => new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 10);

function createGuildCollector({
  listSavedToday,
  collectMember,
  isAvailable = () => true,
  memberDelayMs = 1000,
  retryMs = 5 * 60 * 1000,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console
}) {
  const jobs = new Map();
  const fresh = new Map();
  const queue = [];
  const idleWaiters = [];
  let running = false;
  const keyFor = (world, guild, day) => JSON.stringify([world, guild, day]);
  const memberKey = (world, name, day) => JSON.stringify([world, name, day]);

  function view(job) {
    return {
      worldName: job.worldName, guildName: job.guildName, dateKst: job.dateKst,
      status: job.status, total: job.names.length,
      saved: job.saved, skipped: job.skipped, failed: job.failed,
      remaining: job.names.length - job.saved - job.skipped - job.failed,
      startedAt: job.startedAt, finishedAt: job.finishedAt,
      retryAt: job.retryAt ? new Date(job.retryAt).toISOString() : null
    };
  }

  async function runJob(job) {
    job.status = "running";
    job.startedAt = new Date(now()).toISOString();
    try {
      if (!isAvailable()) throw new Error("storage unavailable");
      const saved = await listSavedToday({ worldName: job.worldName, names: job.names, dateKst: job.dateKst });
      for (const name of saved) fresh.set(memberKey(job.worldName, name, job.dateKst), job.dateKst);
      for (const name of job.names) {
        if (kstDate(now()) !== job.dateKst) {
          job.status = "expired";
          break;
        }
        const key = memberKey(job.worldName, name, job.dateKst);
        if (fresh.has(key)) {
          job.skipped += 1;
          continue;
        }
        if (!isAvailable()) throw new Error("storage unavailable");
        try {
          if (await collectMember({ worldName: job.worldName, characterName: name })) {
            fresh.set(key, job.dateKst);
            job.saved += 1;
          } else {
            job.failed += 1;
          }
        } catch {
          job.failed += 1;
        }
        if (memberDelayMs > 0) await sleep(memberDelayMs);
      }
      if (job.status === "running") job.status = job.failed ? "partial" : "completed";
    } catch (error) {
      job.status = "failed";
      logger.warn("[guild-collection] paused:", error?.message || "collection failed");
    }
    job.finishedAt = new Date(now()).toISOString();
    if (["failed", "partial"].includes(job.status)) job.retryAt = now() + retryMs;
    logger.info(`[guild-collection] ${job.worldName} ${job.guildName} ${job.status} saved=${job.saved} skipped=${job.skipped} failed=${job.failed}`);
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) await runJob(queue.shift());
    } finally {
      running = false;
      idleWaiters.splice(0).forEach((resolve) => resolve());
    }
  }

  function enqueue({ worldName, guildName, members, triggeredBy }) {
    if (!isAvailable()) return { status: "unavailable" };
    const dateKst = kstDate(now());
    for (const [key, day] of fresh) if (day !== dateKst) fresh.delete(key);
    for (const [key, job] of jobs) {
      if (job.dateKst !== dateKst && !["running", "queued"].includes(job.status)) jobs.delete(key);
    }
    // The triggering character was just saved by the foreground request. This also
    // lets an in-progress worker skip members looked up by another user meanwhile.
    if (triggeredBy) fresh.set(memberKey(worldName, triggeredBy, dateKst), dateKst);
    const key = keyFor(worldName, guildName, dateKst);
    const existing = jobs.get(key);
    if (existing && (!existing.retryAt || now() < existing.retryAt)) return view(existing);
    const names = [...new Set((Array.isArray(members) ? members : [])
      .filter((name) => typeof name === "string").map((name) => name.trim()).filter(Boolean))];
    if (!names.length) return { status: "no_members" };
    const job = {
      worldName, guildName, dateKst, names, status: "queued",
      saved: 0, skipped: 0, failed: 0, startedAt: null, finishedAt: null, retryAt: null
    };
    jobs.set(key, job);
    queue.push(job);
    setImmediate(() => { void drain(); });
    return view(job);
  }

  return {
    enqueue,
    getStatus: (worldName, guildName) => {
      const job = jobs.get(keyFor(worldName, guildName, kstDate(now())));
      return job ? view(job) : { status: "not_queued", worldName, guildName, dateKst: kstDate(now()) };
    },
    whenIdle: () => running || queue.length ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve()
  };
}

module.exports = { createGuildCollector };
