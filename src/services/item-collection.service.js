// Daily item collection for the item and spec rankings: every character in the combat-power
// ranking (top 10,000) gets its item-equipment fetched once a day, after Nexon aggregates the
// ranking (~02:30 KST). Per character: /id + item-equipment = 2 Nexon calls.
//
// Dependencies are injected so the run can be tested without Nexon or MongoDB.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const kstDate = (timestamp) => new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 10);

function shiftDate(dateText, days) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function createItemCollector({
  fetchRankingPage,
  resolveOcid,
  fetchItems,
  record,
  collectedSince,
  isAvailable = () => true,
  pages = 50,
  workers = 2,
  delayMs = 50,
  runHourKst = 4,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console
}) {
  let status = { state: "idle", date: null, rankingDate: null, total: 0, saved: 0, skipped: 0, failed: 0, startedAt: null, finishedAt: null, error: null };
  let running = null;
  let timer = null;
  let lastFinishedDate = null;

  /** Ranking rows of the latest aggregated day (today, or yesterday before ~02:30). */
  async function loadRanking(today) {
    for (const date of [today, shiftDate(today, -1)]) {
      let first;
      try {
        first = await fetchRankingPage(date, 1);
      } catch {
        continue;
      }
      if (!first.length) continue;
      const rows = [...first];
      for (let page = 2; page <= pages; page += 1) {
        const list = await fetchRankingPage(date, page);
        if (!list.length) break;
        rows.push(...list);
      }
      return { date, rows };
    }
    return { date: null, rows: [] };
  }

  async function collectRow(row, startOfDay) {
    const name = String(row?.character_name || "").trim();
    const world = String(row?.world_name || "").trim();
    if (!name || !world) return "failed";
    if (await collectedSince(world, name, startOfDay)) return "skipped";
    const ocid = await resolveOcid(name, world);
    if (!ocid) return "failed";
    const itemData = await fetchItems(ocid);
    if (!itemData) return "failed";
    await record({ row, ocid, itemData });
    return "saved";
  }

  async function run() {
    const today = kstDate(now());
    status = { state: "running", date: today, rankingDate: null, total: 0, saved: 0, skipped: 0, failed: 0, startedAt: new Date(now()).toISOString(), finishedAt: null, error: null };
    try {
      if (!isAvailable()) throw new Error("storage unavailable");
      const { date, rows } = await loadRanking(today);
      status.rankingDate = date;
      status.total = rows.length;
      const startOfDay = new Date(Date.parse(`${today}T00:00:00+09:00`));
      let next = 0;
      const worker = async () => {
        while (next < rows.length) {
          const row = rows[next];
          next += 1;
          try {
            status[await collectRow(row, startOfDay)] += 1;
          } catch (error) {
            status.failed += 1;
            if (status.failed <= 5) logger.error("[item-collection] row failed:", error?.message || error);
          }
          if (delayMs) await sleep(delayMs);
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, workers) }, worker));
      status.state = "done";
      lastFinishedDate = today;
    } catch (error) {
      status.state = "failed";
      status.error = error?.message || String(error);
      logger.error("[item-collection] run failed:", status.error);
    } finally {
      status.finishedAt = new Date(now()).toISOString();
      logger.log(`[item-collection] ${JSON.stringify(status)}`);
    }
    return status;
  }

  /** Runs once (no overlap); resolves with the status. */
  function runOnce() {
    if (!running) {
      running = run().finally(() => {
        running = null;
      });
    }
    return running;
  }

  function msUntilNextRun() {
    const current = now();
    const today = kstDate(current);
    const todayRun = Date.parse(`${today}T${String(runHourKst).padStart(2, "0")}:00:00+09:00`);
    return todayRun > current ? todayRun - current : todayRun + DAY_MS - current;
  }

  /**
   * Daily schedule at runHourKst. After a restart past that hour the day's run starts after
   * `startupDelayMs` (characters already collected today are skipped).
   */
  function start({ startupDelayMs = 5 * 60 * 1000 } = {}) {
    if (timer) return;
    const schedule = (delay) => {
      timer = setTimeout(async () => {
        await runOnce();
        schedule(msUntilNextRun());
      }, delay);
      timer.unref?.();
    };
    const current = now();
    const pastRunHour = Number(new Date(current + KST_OFFSET_MS).getUTCHours()) >= runHourKst;
    schedule(pastRunHour && lastFinishedDate !== kstDate(current) ? startupDelayMs : msUntilNextRun());
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
  }

  return { runOnce, start, stop, getStatus: () => ({ ...status }) };
}

module.exports = { createItemCollector };
