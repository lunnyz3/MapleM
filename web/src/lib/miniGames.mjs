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

// ---------------- 장비 합성(2048) ----------------
// 칸 값 = 단계(0 은 빈칸). 같은 단계 둘을 밀어 붙이면 한 단계 위, 점수는 2^(새 단계).
// 1 노말 → 2 레어 → 3 에픽 → 4 유니크 → 5 레전더리 → 6 ★5 → … → 12 ★35

export const MERGE_SIZE = 4;
export const MERGE_GOAL = 12;
export const MERGE_LEVELS = [
  null,
  { label: "노말", grade: "" },
  { label: "레어", grade: "rare" },
  { label: "에픽", grade: "epic" },
  { label: "유니크", grade: "unique" },
  { label: "레전더리", grade: "legendary" },
  ...[5, 10, 15, 20, 25, 30, 35].map((star) => ({ label: `★${star}`, grade: "star", star }))
];

/** 한 줄을 왼쪽으로 밀기 → { row, gained } (한 번 합쳐진 칸은 그 이동에서 다시 합치지 않는다) */
export function slideRow(row) {
  const tiles = row.filter(Boolean);
  const out = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i] === tiles[i + 1]) {
      const level = tiles[i] + 1;
      out.push(level);
      gained += 2 ** level;
      i += 1;
    } else {
      out.push(tiles[i]);
    }
  }
  while (out.length < row.length) out.push(0);
  return { row: out, gained };
}

const transpose = (board) => board[0].map((_, column) => board.map((row) => row[column]));

/**
 * 판을 밀기. dir: "left" | "right" | "up" | "down" → { board, gained, moved }
 * @param {number[][]} board
 */
export function moveBoard(board, dir) {
  const vertical = dir === "up" || dir === "down";
  const reverse = dir === "right" || dir === "down";
  let rows = vertical ? transpose(board) : board.map((row) => [...row]);
  let gained = 0;
  rows = rows.map((row) => {
    const source = reverse ? [...row].reverse() : row;
    const result = slideRow(source);
    gained += result.gained;
    return reverse ? result.row.reverse() : result.row;
  });
  const next = vertical ? transpose(rows) : rows;
  const moved = next.some((row, r) => row.some((value, c) => value !== board[r][c]));
  return { board: next, gained, moved };
}

/** 빈칸 하나에 새 장비(90% 노말, 10% 레어). 빈칸이 없으면 그대로. */
export function spawnTile(board, random = Math.random) {
  const empty = [];
  board.forEach((row, r) => row.forEach((value, c) => !value && empty.push([r, c])));
  if (!empty.length) return board;
  const [r, c] = empty[Math.floor(random() * empty.length)];
  const next = board.map((row) => [...row]);
  next[r][c] = random() < 0.9 ? 1 : 2;
  return next;
}

export function emptyBoard(random = Math.random) {
  const board = Array.from({ length: MERGE_SIZE }, () => Array(MERGE_SIZE).fill(0));
  return spawnTile(spawnTile(board, random), random);
}

/** 더 밀 수 있는지(빈칸이나 붙어 있는 같은 단계). */
export function canMove(board) {
  return board.some((row, r) => row.some((value, c) => !value || value === row[c + 1] || value === board[r + 1]?.[c]));
}

// ---------------- 등급 순서 기억 ----------------

/** 순서에 하나 더(0~3). */
export function extendSequence(sequence, random = Math.random) {
  return [...sequence, Math.floor(random() * 4)];
}

/** 보여 주는 빠르기(ms): 단계가 오를수록 빨라진다. */
export function simonStep(level) {
  return Math.max(260, 620 - level * 22);
}

// ---------------- 장비 이름 타자 ----------------

export const TYPING_SECONDS = 60;
const COMPOUND_VOWELS = new Set([9, 10, 11, 14, 15, 16, 19]);
const COMPOUND_FINALS = new Set([3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18]);

/** 자판을 누르는 횟수(한글은 자모로: 초성 1 + 중성 1~2 + 종성 0~2, 그 밖의 글자 1). */
export function keystrokes(text) {
  let count = 0;
  for (const char of String(text || "")) {
    const code = char.codePointAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) {
      const final = code % 28;
      const vowel = Math.floor(code / 28) % 21;
      count += 1 + (COMPOUND_VOWELS.has(vowel) ? 2 : 1) + (final ? (COMPOUND_FINALS.has(final) ? 2 : 1) : 0);
    } else {
      count += 1;
    }
  }
  return count;
}

/** 분당 타수 */
export function typingSpeed(strokes, seconds) {
  return seconds > 0 ? Math.round((strokes * 60) / seconds) : 0;
}
