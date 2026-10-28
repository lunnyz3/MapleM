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
