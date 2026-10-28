// 랭킹 화면·캐릭터 상세 화면용 API 호출. 같은 요청은 화면을 보는 동안 한 번만 보낸다.
import { ApiError, fetchRankingV2, getJson, isNotReady, toApiError } from "./api.js";
import { kstToday, shiftDate } from "./format.js";
import { RANKING_DATE_FLOOR, getRankingType } from "./game.js";

// ======================= 랭킹 =======================

/** 화면 한 쪽에 보여줄 순위 수. 넥슨 API는 한 번에 200개를 준다. */
export const RANKING_PAGE_SIZE = 50;
const API_PAGE_SIZE = 200;

/** @type {Map<string, Promise<{ status: "ok", rows: any[], date?: string } | { status: "not-ready" }>>} */
const apiPageCache = new Map();

/**
 * 넥슨 랭킹 API 한 쪽(200개). 순위 변동 API(/api/v2/ranking)가 있으면 그걸 쓰고(행에 rankChange·isNew),
 * 없으면 기존 API. 순위 변동 API는 빈 날짜면 서버가 이전 집계일로 옮기므로 실제 집계일(date)을 함께 돌려준다.
 * @param {string} typeId @param {string} date @param {number} apiPage @param {string} world
 */
function fetchApiPage(typeId, date, apiPage, world) {
  const key = `${typeId}|${date}|${apiPage}|${world}`;
  let pending = apiPageCache.get(key);
  if (!pending) {
    pending = (async () => {
      const withChange = await fetchRankingV2(typeId, { date, page: apiPage, world });
      if (withChange) return { status: /** @type {const} */ ("ok"), rows: withChange.rows, date: withChange.date };
      const query = new URLSearchParams({ date, page: String(apiPage) });
      if (world) query.set("world_name", world);
      const { response, body } = await getJson(`/api/maplestorym/ranking/${encodeURIComponent(typeId)}?${query}`);
      if (response.ok && body?.ok) {
        return { status: /** @type {const} */ ("ok"), rows: Array.isArray(body?.data?.ranking) ? body.data.ranking : [] };
      }
      if (response.status === 400 && isNotReady(body)) return { status: /** @type {const} */ ("not-ready") };
      throw toApiError(response, body);
    })();
    pending.catch(() => apiPageCache.delete(key));
    apiPageCache.set(key, pending);
  }
  return pending;
}

/**
 * @typedef {Object} RankingPage
 * @property {any[]} rows           이 쪽의 순위(최대 50)
 * @property {string | null} date   실제로 보여주는 집계일
 * @property {string} requestedDate 요청한 날짜
 * @property {boolean} hasMore      다음 쪽이 있을 수 있음
 * @property {number} page
 */

/**
 * 랭킹 한 쪽. 1쪽인데 그날 데이터가 없으면(집계 전·빈 날) 하루씩 거슬러 올라간다(캐릭터 7일, 길드 14일).
 * @param {{ typeId: string, date: string, page: number, world: string }} params
 * @returns {Promise<RankingPage>}
 */
export async function loadRankingPage({ typeId, date, page, world }) {
  const type = getRankingType(typeId);
  const start = (page - 1) * RANKING_PAGE_SIZE;
  const apiPage = Math.floor(start / API_PAGE_SIZE) + 1;
  const offset = start % API_PAGE_SIZE;
  const maxBack = page === 1 ? (type.subject === "guild" ? 14 : 7) : 0;
  let current = date;

  for (let step = 0; step <= maxBack && current >= RANKING_DATE_FLOOR; step += 1) {
    const result = await fetchApiPage(type.id, current, apiPage, world);
    if (result.status === "ok" && (result.rows.length || page > 1)) {
      const rows = result.rows.slice(offset, offset + RANKING_PAGE_SIZE);
      const hasMore = offset + RANKING_PAGE_SIZE < result.rows.length || result.rows.length === API_PAGE_SIZE;
      return { rows, date: result.date || current, requestedDate: date, hasMore: rows.length === RANKING_PAGE_SIZE && hasMore, page };
    }
    // 서버가 이미 더 이전 날짜까지 찾아봤으면 그 앞날부터 이어 간다.
    if (result.status === "ok" && result.date && result.date < current) current = result.date;
    current = shiftDate(current, -1);
  }
  return { rows: [], date: null, requestedDate: date, hasMore: false, page };
}

/**
 * 캐릭터 이름으로 순위 찾기: 이름 → ocid → 그날 순위. 못 찾으면 null.
 * @param {{ typeId: string, date: string, name: string, world: string }} params
 * @returns {Promise<{ ranking: number, worldRanking: number | null, date: string, row: any } | null>}
 */
export async function findCharacterRank({ typeId, date, name, world }) {
  const idQuery = new URLSearchParams({ character_name: name, world_name: world });
  const { response, body } = await getJson(`/api/maplestorym/id?${idQuery}`);
  if (response.status === 429 || response.status >= 500) throw toApiError(response, body, "캐릭터를 찾지 못했어요.");
  const ocid = String(body?.ocid || body?.data?.ocid || "").trim();
  if (!response.ok || !ocid) return null;

  let current = date;
  for (let step = 0; step < 3 && current >= RANKING_DATE_FLOOR; step += 1) {
    const query = new URLSearchParams({ date: current, ocid });
    const result = await getJson(`/api/maplestorym/ranking/${encodeURIComponent(typeId)}?${query}`);
    if (result.response.ok && result.body?.ok) {
      const row = (result.body?.data?.ranking || [])[0];
      const ranking = Number(row?.ranking);
      if (!row || !Number.isFinite(ranking) || ranking < 1) return null;
      const worldRanking = Number(row?.world_ranking);
      return { ranking, worldRanking: Number.isFinite(worldRanking) && worldRanking > 0 ? worldRanking : null, date: current, row };
    }
    if (!(result.response.status === 400 && isNotReady(result.body))) return null;
    current = shiftDate(current, -1);
  }
  return null;
}

// ======================= 캐릭터 =======================

/**
 * 캐릭터 상세 데이터(기존 page-data). 없는 캐릭터면 status 404 ApiError.
 * @param {string} world @param {string} name
 */
export async function loadCharacterPage(world, name, { refresh = false } = {}) {
  const query = new URLSearchParams({ world_name: world, character_name: name });
  // 갱신: 넥슨 응답 캐시를 거치지 않는다(서버가 캐릭터마다 1분에 한 번만 허용).
  if (refresh) query.set("refresh", "1");
  const { response, body } = await getJson(`/api/maplestorym/character/page-data?${query}`);
  if (response.ok && body?.ok) return body;
  const code = String(body?.error?.error?.name || body?.error?.name || "");
  if (response.status === 400 || response.status === 404 || code === "OPENAPI00004") {
    throw new ApiError("캐릭터를 찾지 못했어요.", { status: 404, detail: code || `HTTP ${response.status}` });
  }
  throw toApiError(response, body, "캐릭터 정보를 불러오지 못했어요.");
}

/**
 * 경험치 기록(자체 수집). 기록이 없으면 빈 배열.
 * @param {string} ocid
 * @returns {Promise<{ points: Array<{ ts: string, exp: number | null, expRate: number | null, level: number | null }>, daily: any[] }>}
 */
export async function loadExpHistory(ocid) {
  const { response, body } = await getJson(`/api/maplestorym/character/exp-history?${new URLSearchParams({ ocid })}`);
  if (!response.ok || !body?.ok) throw toApiError(response, body, "성장 기록을 불러오지 못했어요.");
  return { points: Array.isArray(body.points) ? body.points : [], daily: Array.isArray(body.dailySnapshots) ? body.dailySnapshots : [] };
}

// ======================= 길드 =======================

/**
 * 길드 상세: 이름 → oguild_id → 기본 정보(길드원·스킬·건물·어빌리티). 없는 길드면 status 404 ApiError.
 * @param {string} world @param {string} name
 * @returns {Promise<Record<string, any>>} 넥슨 guild/basic 의 data
 */
export async function loadGuild(world, name) {
  const idQuery = new URLSearchParams({ world_name: world, guild_name: name });
  const idResult = await getJson(`/api/maplestorym/guild/id?${idQuery}`);
  const notFound = (/** @type {any} */ body, /** @type {Response} */ response) => {
    const code = String(body?.error?.error?.name || body?.error?.name || "");
    return response.status === 400 || response.status === 404 || code === "OPENAPI00004";
  };
  if (!idResult.response.ok || !idResult.body?.ok) {
    if (notFound(idResult.body, idResult.response)) throw new ApiError("길드를 찾지 못했어요.", { status: 404 });
    throw toApiError(idResult.response, idResult.body, "길드 정보를 불러오지 못했어요.");
  }
  const oguildId = String(idResult.body?.data?.oguild_id || "").trim();
  if (!oguildId) throw new ApiError("길드를 찾지 못했어요.", { status: 404 });

  const { response, body } = await getJson(`/api/maplestorym/guild/basic?${new URLSearchParams({ oguild_id: oguildId })}`);
  if (response.ok && body?.ok && body.data) return body.data;
  if (notFound(body, response)) throw new ApiError("길드를 찾지 못했어요.", { status: 404 });
  throw toApiError(response, body, "길드 정보를 불러오지 못했어요.");
}

// ======================= 직접 입력(빈칸 채우기) =======================

/**
 * @typedef {Object} ManualInputDef
 * @property {string} id
 * @property {string} label
 * @property {string} group             그룹 id
 * @property {string} [groupLabel]       그룹 이름
 * @property {boolean} [jobFamily]       직업 계열(물리/마법)에 맞춰 더하는 값
 * @property {"flat" | "percent" | "level"} unit
 * @property {number} min
 * @property {number} max
 * @property {number} step
 * @property {number} default
 * @property {string[] | string} [appliesTo]
 * @property {string} [description]
 * @property {Array<{ value?: number, level?: number, label?: string }>} [levels]
 */

/** @type {Promise<{ status: "ready", items: ManualInputDef[], groups: Array<{ id: string, label: string }> } | { status: "unavailable" }> | null} */
let manualDefs = null;

/** 직접 입력 항목 목록. 서버에 아직 없으면(404 등) unavailable. */
export function loadManualInputs() {
  if (!manualDefs) {
    manualDefs = (async () => {
      try {
        const { response, body } = await getJson("/api/v2/manual-inputs");
        if (response.ok && body?.ok && Array.isArray(body.items)) {
          const groups = Array.isArray(body.groups) ? body.groups.filter((group) => group && group.id) : [];
          return { status: /** @type {const} */ ("ready"), items: body.items.filter((item) => item && item.id && item.label), groups };
        }
      } catch {
        // 네트워크 오류도 "준비 중"으로 보여준다.
      }
      return { status: /** @type {const} */ ("unavailable") };
    })();
  }
  return manualDefs;
}

/**
 * 직접 입력값을 반영해 스탯을 다시 계산한다.
 * @param {{ world: string, name: string, manual: Record<string, number> }} params
 */
export async function postCharacterStats({ world, name, manual }) {
  const { response, body } = await getJson("/api/v2/character-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ world_name: world, character_name: name, manual })
  });
  if (response.ok && body?.ok) return body;
  throw toApiError(response, body, body?.message ? String(body.message) : "직접 입력을 반영하지 못했어요.");
}

/** 오늘(서울) 날짜. 랭킹 기본값. */
export const today = () => kstToday();
