// 미니게임 오락실(순수 함수): 레전더리 반응속도 · 스타캐치 · 짝 맞추기 · 아이템 이름 맞히기 · 아이템 줍기.
// 화면은 web/src/pages/game/*.jsx. random 은 테스트에서 바꿔 끼운다.

const round3 = (value) => Math.round(value * 1000) / 1000;

/** 섞은 사본(Fisher–Yates). */
export function shuffled(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------------- 레전더리 반응속도 ----------------

export const REACTION_TRIES = 5;
const DECOYS = ["rare", "epic", "unique"];

/** 레전더리가 뜰 때까지 기다리는 시간(ms): 1.2~4초. */
export function reactionDelay(random = Math.random) {
  return Math.round(1200 + random() * 2800);
}

/** 기다리는 동안 바뀌는 등급(레전더리 말고, 바로 앞과 다른 것). */
export function decoyGrade(previous, random = Math.random) {
  const options = DECOYS.filter((grade) => grade !== previous);
  return options[Math.floor(random() * options.length)];
}

/** 평균(ms, 반올림). 없으면 0. */
export function averageMs(times) {
  const valid = times.filter((time) => Number.isFinite(time) && time > 0);
  return valid.length ? Math.round(valid.reduce((sum, time) => sum + time, 0) / valid.length) : 0;
}

/** 평균 반응 시간 → 칭호 */
export function reactionTitle(ms) {
  if (ms > 0 && ms < 200) return "번개 손";
  if (ms > 0 && ms < 250) return "빠른 손";
  if (ms > 0 && ms < 320) return "보통 손";
  return "느긋한 손";
}

// ---------------- 스타캐치 ----------------

export const STAR_MAX = 35;
export const STAR_LIVES = 3;

/** 지금 별 수 → 멈춰야 할 구간 너비(막대 대비 0~1)와 별이 움직이는 빠르기(막대 너비/초). */
export function starStage(star) {
  const t = Math.min(1, Math.max(0, star) / STAR_MAX);
  return { width: round3(0.22 - 0.16 * t), speed: round3(0.7 + 1.5 * t) };
}

/** 지난 시간(초) → 막대 위 자리 0~1(끝에서 되돌아오는 왕복). */
export function pingPong(seconds, speed) {
  const x = (Math.max(0, seconds) * speed) % 2;
  return x <= 1 ? x : 2 - x;
}

/** 구간 시작 자리(구간이 막대 안에 들어가게). */
export function zoneStart(width, random = Math.random) {
  return round3(random() * (1 - width));
}

export function inZone(position, start, width) {
  return position >= start && position <= start + width;
}

// ---------------- 짝 맞추기 ----------------

/** 아이콘이 서로 다른 장비 pairs 개로 카드 2 × pairs 장(섞어서): [{ id, pair, item }]. 장비가 모자라면 있는 만큼. */
export function makeDeck(items, pairs, random = Math.random) {
  const chosen = [];
  const icons = new Set();
  for (const item of shuffled(items, random)) {
    if (!item?.icon || icons.has(item.icon)) continue;
    icons.add(item.icon);
    chosen.push(item);
    if (chosen.length === pairs) break;
  }
  return shuffled(
    chosen.flatMap((item, index) => [
      { id: index * 2, pair: index, item },
      { id: index * 2 + 1, pair: index, item }
    ]),
    random
  );
}

// ---------------- 아이템 이름 맞히기 ----------------

export const QUIZ_ROUNDS = 10;

/**
 * 문제 count 개: 정답 하나와 오답 셋(같은 부위 먼저, 모자라면 다른 부위). 보기끼리 이름·아이콘이 겹치지 않는다.
 * @returns {Array<{ answer: any, options: any[] }>}
 */
export function makeQuiz(items, count, random = Math.random) {
  const pool = items.filter((item) => item?.name && item?.icon);
  return shuffled(pool, random)
    .slice(0, count)
    .map((answer) => {
      const names = new Set([answer.name]);
      const icons = new Set([answer.icon]);
      const wrong = [];
      const take = (candidates) => {
        for (const item of shuffled(candidates, random)) {
          if (wrong.length === 3) return;
          if (names.has(item.name) || icons.has(item.icon)) continue;
          names.add(item.name);
          icons.add(item.icon);
          wrong.push(item);
        }
      };
      take(pool.filter((item) => item.slot === answer.slot));
      take(pool);
      return { answer, options: shuffled([answer, ...wrong], random) };
    });
}

// ---------------- 아이템 줍기 ----------------

export const CATCH_SECONDS = 30;
const GRADE_POINTS = { 레전더리: 50, 유니크: 30, 에픽: 20, 레어: 10 };

/** 장비 등급 → 점수 */
export function catchPoints(grade) {
  return GRADE_POINTS[grade] || 5;
}

/** 연속으로 주운 수 → 점수 배수(놓치면 처음부터). */
export function comboRate(combo) {
  if (combo >= 15) return 2;
  if (combo >= 8) return 1.5;
  return 1;
}

/** 지난 시간(초) → 다음 장비까지(ms): 처음 약 0.9초, 끝 무렵 약 0.4초. */
export function spawnGap(elapsed, random = Math.random) {
  const t = Math.min(1, Math.max(0, elapsed) / CATCH_SECONDS);
  return Math.round((900 - 500 * t) * (0.75 + random() * 0.5));
}

/** 떨어지는 빠르기(판 높이/초): 처음 약 0.28, 끝 무렵 약 0.6. */
export function fallSpeed(elapsed, random = Math.random) {
  const t = Math.min(1, Math.max(0, elapsed) / CATCH_SECONDS);
  return round3((0.28 + 0.32 * t) * (0.85 + random() * 0.3));
}
