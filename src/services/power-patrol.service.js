"use strict";

// 전투력 순찰: 모은 캐릭터의 전투력(넥슨 stat, 지금 낀 장비 기준)을 주기마다(기본 1시간) 다시 읽어, 그날 최고보다 높으면
// recordPeak 으로 날짜별 기록·스펙에 남긴다. 보스 세팅을 맞춰 두고 평소엔 사냥 세팅으로 다니는 캐릭터도 보스 세팅으로
// 바꿔 낀 때를 잡는다. 같은 날 이미 본 값 이하면 DB 를 읽지도 쓰지도 않는다(그날 최고를 메모리에 둔다).
// 한 바퀴가 주기보다 길면 끝난 뒤 1분 쉬고 다음 바퀴(겹치지 않는다). 의존성은 주입한다(src/jobs/power-patrol.job.js).

const MIN_GAP_MS = 60 * 1000;
const kstDate = (date) => new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * @param {{
 *   listTargets: () => Promise<Array<{ ocid: string, worldName?: string, characterName?: string }>>,
 *   fetchPower: (ocid: string) => Promise<number | null>,
 *   recordPeak: (input: { ocid: string, worldName?: string, characterName?: string, value: number, now: Date }) => Promise<{ todayMax: number, wrote: boolean } | null>,
 *   isAvailable?: () => boolean,
 *   intervalMs?: number,
 *   firstDelayMs?: number,
 *   workers?: number,
 *   now?: () => Date,
 *   logger?: { log: Function, error: Function }
 * }} deps
 */
function createPowerPatrol({
  listTargets,
  fetchPower,
  recordPeak,
  isAvailable = () => true,
  intervalMs = 60 * 60 * 1000,
  firstDelayMs = 2 * 60 * 1000,
  workers = 10,
  now = () => new Date(),
  logger = console
}) {
  /** 오늘(서울 날짜) 캐릭터마다 본 가장 높은 전투력 */
  const todayMax = new Map();
  let day = "";
  let running = null;
  let timer = null;
  let stopped = true;
  const status = { state: "idle", passes: 0, last: null };

  const seenToday = (ocid, date) => {
    if (date !== day) {
      todayMax.clear();
      day = date;
    }
    return todayMax.get(ocid);
  };

  async function pass() {
    const started = now();
    const targets = await listTargets();
    const counts = { targets: targets.length, fetched: 0, raised: 0, skipped: 0, failed: 0 };
    let next = 0;
    const worker = async () => {
      while (next < targets.length && !stopped) {
        const target = targets[next];
        next += 1;
        let value = null;
        try {
          value = await fetchPower(target.ocid);
        } catch {
          value = null;
        }
        if (!(Number(value) > 0)) {
          counts.failed += 1;
          continue;
        }
        counts.fetched += 1;
        const at = now();
        const known = seenToday(target.ocid, kstDate(at));
        if (known !== undefined && value <= known) {
          counts.skipped += 1;
          continue;
        }
        try {
          const result = await recordPeak({ ...target, value, now: at });
          if (result) {
            todayMax.set(target.ocid, Math.max(value, Number(result.todayMax) || 0));
            if (result.wrote) counts.raised += 1;
          }
        } catch {
          counts.failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, targets.length)) }, worker));
    const result = { ...counts, startedAt: started.toISOString(), ms: now().getTime() - started.getTime() };
    status.passes += 1;
    status.last = result;
    return result;
  }

  /** 한 바퀴(이미 돌고 있으면 그 바퀴를 기다린다). */
  function runOnce() {
    if (!running) {
      status.state = "running";
      running = pass().finally(() => {
        running = null;
        status.state = stopped ? "idle" : "waiting";
      });
    }
    return running;
  }

  function schedule(delayMs) {
    timer = setTimeout(async () => {
      if (stopped) return;
      const started = Date.now();
      if (isAvailable()) {
        try {
          const result = await runOnce();
          logger.log(
            `[power-patrol] ${result.targets} targets: fetched ${result.fetched}, raised ${result.raised}, skipped ${result.skipped}, failed ${result.failed} in ${Math.round(result.ms / 1000)}s`
          );
        } catch (error) {
          logger.error("[power-patrol] pass failed:", error?.message || error);
        }
      }
      if (!stopped) schedule(Math.max(MIN_GAP_MS, intervalMs - (Date.now() - started)));
    }, delayMs);
    timer.unref?.();
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      status.state = "waiting";
      schedule(firstDelayMs);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      status.state = running ? "stopping" : "idle";
    },
    runOnce: () => {
      const wasStopped = stopped;
      stopped = false;
      return runOnce().finally(() => {
        if (wasStopped) stopped = true;
      });
    },
    getStatus: () => ({ ...status, todayKnown: todayMax.size })
  };
}

module.exports = { createPowerPatrol };
