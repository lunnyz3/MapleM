// 직접 입력값 저장(캐릭터별 localStorage: mmp.manual.<월드>.<이름>). 저장소를 못 쓰면 이번 방문 동안 메모리로.

/** @type {Map<string, Record<string, number>>} */
const memory = new Map();

/** @param {string} world @param {string} name */
const keyOf = (world, name) => `mmp.manual.${world}.${name}`;

/**
 * 저장된 값(숫자만). 없으면 {}.
 * @param {string} world @param {string} name
 * @returns {Record<string, number>}
 */
export function readManual(world, name) {
  const key = keyOf(world, name);
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      /** @type {Record<string, number>} */
      const clean = {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [id, value] of Object.entries(parsed)) {
          const number = Number(value);
          if (/^[\w.-]{1,64}$/.test(id) && Number.isFinite(number)) clean[id] = number;
        }
      }
      return clean;
    }
  } catch {
    // 저장소를 쓸 수 없는 환경
  }
  return { ...(memory.get(key) || {}) };
}

/**
 * 값을 저장한다(빈 객체면 지운다).
 * @param {string} world @param {string} name @param {Record<string, number>} values
 */
export function writeManual(world, name, values) {
  const key = keyOf(world, name);
  const empty = !Object.keys(values).length;
  memory.set(key, { ...values });
  try {
    if (empty) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // 저장 실패는 무시하고 메모리 값으로 계속한다.
  }
}

const SHARE_PARAM = "m";
const MAX_SHARED = 30;

/**
 * 공유 링크에 담을 글자: { id: 값 } → "id:값,id:값". 값이 없으면 "".
 * @param {Record<string, number>} values
 */
export function encodeManual(values) {
  return Object.entries(values || {})
    .filter(([id, value]) => /^[\w.-]{1,64}$/.test(id) && Number.isFinite(Number(value)))
    .slice(0, MAX_SHARED)
    .map(([id, value]) => `${id}:${Number(value)}`)
    .join(",");
}

/**
 * 링크의 글자 → { id: 값 }. 형식이 틀린 항목은 버린다.
 * @param {string | null | undefined} text
 * @returns {Record<string, number>}
 */
export function decodeManual(text) {
  /** @type {Record<string, number>} */
  const values = {};
  for (const part of String(text || "").split(",").slice(0, MAX_SHARED)) {
    const match = /^([\w.-]{1,64}):(-?\d+(?:\.\d+)?)$/.exec(part.trim());
    if (match && Math.abs(Number(match[2])) < 1e12) values[match[1]] = Number(match[2]);
  }
  return values;
}

/**
 * 캐릭터 주소 + 직접 입력값(있을 때 ?m=).
 * @param {string} path @param {Record<string, number>} values
 */
export function withManual(path, values) {
  const encoded = encodeManual(values);
  return encoded ? `${path}?${new URLSearchParams({ [SHARE_PARAM]: encoded })}` : path;
}

/**
 * 지금 주소에 담긴 직접 입력값을 읽고 주소에서는 지운다(새로 고침해도 다시 덮어쓰지 않게). 없으면 null.
 * @returns {Record<string, number> | null}
 */
export function takeManualFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SHARE_PARAM)) return null;
    const values = decodeManual(url.searchParams.get(SHARE_PARAM));
    url.searchParams.delete(SHARE_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    return Object.keys(values).length ? values : null;
  } catch {
    return null;
  }
}
