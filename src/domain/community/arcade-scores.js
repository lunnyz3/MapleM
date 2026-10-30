"use strict";

// 미니게임 랭킹(순수 함수): 게임마다 점수 범위·최소 플레이 시간, 이번 주 열쇠, 시작 표(서명) 만들기·확인.
// 낮을수록 좋은 기록(반응 시간·뒤집은 횟수)은 정렬 점수를 음수로 둔다(높을수록 위).
const crypto = require("crypto");

// lower: 낮을수록 좋은 기록 · min/max: 받을 수 있는 값 · seconds(value): 그 기록을 내는 데 걸리는 최소 시간
const GAME_RULES = Object.freeze({
  vs: { lower: false, min: 1, max: 300, seconds: (value) => value },
  guess: { lower: false, min: 1, max: 5000, seconds: () => 10 },
  reaction: { lower: true, min: 100, max: 1500, seconds: () => 6 },
  star: { lower: false, min: 1, max: 35, seconds: (value) => value * 0.3 },
  memory: { lower: true, min: 8, max: 300, seconds: (value) => value * 0.4 },
  quiz: { lower: false, min: 1, max: 10, seconds: () => 10 },
  catch: { lower: false, min: 1, max: 20000, seconds: () => 30 },
  merge: { lower: false, min: 4, max: 400000, seconds: (value) => value / 150 },
  simon: { lower: false, min: 1, max: 100, seconds: (value) => value },
  typing: { lower: false, min: 10, max: 1500, seconds: () => 60 },
  sf: { lower: false, min: 1, max: 35, seconds: (value) => value * 0.25 }
});

const TOKEN_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;

/** 이번 주(서울 월요일 시작) 열쇠 "YYYY-MM-DD"(그 주 월요일). */
function weekKey(now = new Date()) {
  const kst = new Date(now.getTime() + KST_MS);
  const day = (kst.getUTCDay() + 6) % 7;
  kst.setUTCDate(kst.getUTCDate() - day);
  return kst.toISOString().slice(0, 10);
}

/** 기록 → 정렬 점수(높을수록 위) */
const sortScore = (game, value) => (GAME_RULES[game]?.lower ? -value : value);
/** 정렬 점수 → 기록 */
const valueOf = (game, score) => (GAME_RULES[game]?.lower ? -score : score);

/**
 * @returns {{ ok: true, value: number } | { ok: false, reason: "game" | "value" | "fast" }}
 */
function checkScore(game, rawValue, elapsedMs) {
  const rule = GAME_RULES[game];
  if (!rule) return { ok: false, reason: "game" };
  const value = Math.round(Number(rawValue));
  if (!Number.isFinite(value) || value < rule.min || value > rule.max) return { ok: false, reason: "value" };
  if (!(elapsedMs >= rule.seconds(value) * 1000)) return { ok: false, reason: "fast" };
  return { ok: true, value };
}

const sign = (secret, body) => crypto.createHmac("sha256", secret).update(body).digest("base64url").slice(0, 22);

/** 게임 시작 표: "게임.시각.임의값.서명" */
function issueToken(secret, game, now = Date.now()) {
  const body = `${game}.${now.toString(36)}.${crypto.randomBytes(6).toString("base64url")}`;
  return `${body}.${sign(secret, body)}`;
}

/**
 * @returns {{ ok: true, issuedAt: number } | { ok: false }}
 */
function verifyToken(secret, token, game, now = Date.now()) {
  const parts = String(token || "").split(".");
  if (parts.length !== 4 || parts[0] !== game) return { ok: false };
  const body = parts.slice(0, 3).join(".");
  const expected = sign(secret, body);
  const given = parts[3];
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return { ok: false };
  const issuedAt = parseInt(parts[1], 36);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 1000 || now - issuedAt > TOKEN_MAX_AGE_MS) return { ok: false };
  return { ok: true, issuedAt };
}

/** 정렬된 줄에 순위(같은 점수는 같은 순위). */
function rankRows(rows) {
  let rank = 0;
  let previous = null;
  return rows.map((row, index) => {
    if (row.score !== previous) {
      rank = index + 1;
      previous = row.score;
    }
    return { ...row, rank };
  });
}

module.exports = { GAME_RULES, weekKey, sortScore, valueOf, checkScore, issueToken, verifyToken, rankRows };
