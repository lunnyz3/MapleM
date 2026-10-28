// 기존 서버 API(/api/maplestorym/*) 호출. 넥슨 할당량을 아끼려고 같은 요청은 한 번만 보낸다.
import { RANKING_DATE_FLOOR, getRankingType } from "./game.js";
import { kstToday, shiftDate } from "./format.js";

/**
 * 화면에 보여줄 수 있는 문장으로 정리한 오류.
 */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, detail?: string }} [info]
   */
  constructor(message, info = {}) {
    super(message);
    this.name = "ApiError";
    this.status = info.status ?? 0;
    this.detail = info.detail ?? "";
  }
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<{ response: Response, body: any }>}
 */
export async function getJson(url, init = {}) {
  let response;
  try {
    response = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init.headers || {}) } });
  } catch {
    throw new ApiError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

/**
 * 오늘 랭킹이 아직 집계되지 않았다는 넥슨 응답인지.
 * @param {any} body
 */
export function isNotReady(body) {
  const error = body?.error?.error || body?.error || {};
  const text = `${error.name || ""} ${error.message || body?.message || ""}`.toLowerCase();
  return text.includes("openapi00009") || text.includes("data is ready") || text.includes("valid parameter");
}

/**
 * @param {Response} response
 * @param {any} body
 */
export function toApiError(response, body, fallback = "랭킹 정보를 불러오지 못했어요.") {
  const status = response.status;
  if (status === 429) {
    return new ApiError("요청이 너무 많아요. 1분쯤 뒤에 다시 시도해 주세요.", { status, detail: "HTTP 429" });
  }
  if (status >= 500) {
    return new ApiError("넥슨 API 응답이 원활하지 않아요. 잠시 후 다시 시도해 주세요.", { status, detail: `HTTP ${status}` });
  }
  return new ApiError(fallback, { status, detail: `HTTP ${status}` });
}

/**
 * @typedef {Object} RankingResult
 * @property {string} type
 * @property {string | null} date        실제로 보여주는 집계일(없으면 null)
 * @property {string} requestedDate      처음 요청한 날짜(오늘)
 * @property {Record<string, any>[]} rows 상위 5개
 */

const TOP_COUNT = 5;
/** @type {Map<string, Promise<RankingResult>>} */
const rankingCache = new Map();
/** 이미 받은 결과(탭을 다시 눌렀을 때 자리표시 없이 바로 보여준다). @type {Map<string, RankingResult>} */
const settledRankings = new Map();

/**
 * 오늘부터 하루씩 거슬러 올라가며 데이터가 있는 가장 최근 집계일의 상위 5개를 가져온다.
 * 길드 랭킹(샤레니안)은 매일 집계되지 않아 더 멀리(14일) 찾는다.
 * @param {string} typeId
 * @returns {Promise<RankingResult>}
 */
async function fetchTopRanking(typeId) {
  const type = getRankingType(typeId);
  const today = kstToday();
  const maxBack = type.subject === "guild" ? 14 : 3;
  let date = today;

  for (let step = 0; step <= maxBack && date >= RANKING_DATE_FLOOR; step += 1) {
    const query = new URLSearchParams({ date, page: "1" });
    const { response, body } = await getJson(`/api/maplestorym/ranking/${encodeURIComponent(type.id)}?${query}`);

    if (response.ok && body?.ok) {
      const rows = Array.isArray(body?.data?.ranking) ? body.data.ranking : [];
      if (rows.length) return { type: type.id, date, requestedDate: today, rows: rows.slice(0, TOP_COUNT) };
    } else if (!(response.status === 400 && isNotReady(body))) {
      throw toApiError(response, body);
    }
    date = shiftDate(date, -1);
  }
  return { type: type.id, date: null, requestedDate: today, rows: [] };
}

/**
 * 같은 랭킹은 이 화면을 보는 동안 한 번만 부른다(실패하면 다시 부를 수 있게 지운다).
 * @param {string} typeId
 * @param {{ force?: boolean }} [options]
 */
export function loadRanking(typeId, options = {}) {
  if (options.force) {
    rankingCache.delete(typeId);
    settledRankings.delete(typeId);
  }
  let pending = rankingCache.get(typeId);
  if (!pending) {
    pending = fetchTopRanking(typeId);
    pending.then(
      (result) => settledRankings.set(typeId, result),
      () => rankingCache.delete(typeId)
    );
    rankingCache.set(typeId, pending);
  }
  return pending;
}

/**
 * 이미 받은 랭킹 결과가 있으면 바로 돌려준다(없으면 null).
 * @param {string} typeId
 */
export function peekRanking(typeId) {
  return settledRankings.get(typeId) || null;
}

// ---------- 캐릭터 이미지(썸네일): 동시에 3개까지만 ----------

/** @type {Map<string, Promise<string>>} */
const imageCache = new Map();
/** @type {Array<() => void>} */
const imageQueue = [];
let imageActive = 0;
const IMAGE_CONCURRENCY = 3;

function pumpImages() {
  while (imageActive < IMAGE_CONCURRENCY && imageQueue.length) {
    imageActive += 1;
    imageQueue.shift()?.();
  }
}

/**
 * 캐릭터 이미지 주소. 없거나 실패하면 빈 문자열.
 * @param {string} world
 * @param {string} name
 * @returns {Promise<string>}
 */
export function loadCharacterImage(world, name) {
  const key = `${world}|${name}`;
  let pending = imageCache.get(key);
  if (!pending) {
    pending = new Promise((resolve) => {
      imageQueue.push(async () => {
        try {
          const query = new URLSearchParams({ world_name: world, character_name: name });
          const { response, body } = await getJson(`/api/maplestorym/character/image?${query}`);
          resolve(response.ok && body?.ok ? String(body.imageUrl || "") : "");
        } catch {
          resolve("");
        } finally {
          imageActive -= 1;
          pumpImages();
        }
      });
      pumpImages();
    });
    imageCache.set(key, pending);
  }
  return pending;
}
