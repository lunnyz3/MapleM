// 최근 검색·즐겨찾기(로그인 없이 브라우저 localStorage).
// 저장소를 쓸 수 없는 환경(사생활 보호 모드, 차단)에서도 이번 방문 동안은 메모리로 동작한다.
import { useEffect, useState } from "preact/hooks";
import { WORLDS } from "./game.js";

/**
 * @typedef {import("./game.js").SearchKind} SearchKind
 * @typedef {{ kind: SearchKind, world: string, name: string, at: number }} SavedEntry
 * @typedef {{ recent: SavedEntry[], favorites: SavedEntry[] }} SavedState
 */

const KEYS = /** @type {const} */ ({ recent: "mmp.recent", favorites: "mmp.favorites" });
const LIMITS = { recent: 10, favorites: 20 };
const NAME_MAX = 24;

/** @type {Set<() => void>} */
const listeners = new Set();
/** @type {SavedState | null} */
let state = null;

/**
 * 저장값을 그대로 믿지 않고 형태를 검사한다.
 * @param {any} item
 * @returns {SavedEntry | null}
 */
function sanitize(item) {
  if (!item || typeof item !== "object") return null;
  const kind = item.kind === "guild" ? "guild" : "character";
  const world = String(item.world || "");
  const name = String(item.name || "").trim();
  if (!WORLDS.includes(world) || !name || name.length > NAME_MAX) return null;
  const at = Number.isFinite(item.at) ? Number(item.at) : 0;
  return { kind, world, name, at };
}

/** @param {"recent" | "favorites"} list */
function read(list) {
  try {
    const raw = window.localStorage.getItem(KEYS[list]);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /** @type {SavedEntry[]} */
    const entries = [];
    const seen = new Set();
    for (const item of parsed) {
      const entry = sanitize(item);
      if (entry && !seen.has(entryKey(entry))) {
        seen.add(entryKey(entry));
        entries.push(entry);
      }
    }
    return entries.slice(0, LIMITS[list]);
  } catch {
    return [];
  }
}

/** @param {"recent" | "favorites"} list @param {SavedEntry[]} entries */
function write(list, entries) {
  try {
    window.localStorage.setItem(KEYS[list], JSON.stringify(entries));
  } catch {
    // 저장 실패(용량·차단)는 무시하고 메모리 상태로 계속한다.
  }
}

function load() {
  if (!state) state = { recent: read("recent"), favorites: read("favorites") };
  return state;
}

/** @param {SavedState} next */
function commit(next) {
  const prev = load();
  state = next;
  if (next.recent !== prev.recent) write("recent", next.recent);
  if (next.favorites !== prev.favorites) write("favorites", next.favorites);
  listeners.forEach((listener) => listener());
}

/** @param {{ kind: SearchKind, world: string, name: string }} entry */
export function entryKey(entry) {
  return `${entry.kind}|${entry.world}|${entry.name}`;
}

/** @returns {SavedState} */
export function getSaved() {
  return load();
}

/** @param {{ kind: SearchKind, world: string, name: string }} entry */
export function addRecent(entry) {
  const clean = sanitize({ ...entry, at: Date.now() });
  if (!clean) return;
  const key = entryKey(clean);
  const { recent, favorites } = load();
  commit({ favorites, recent: [clean, ...recent.filter((item) => entryKey(item) !== key)].slice(0, LIMITS.recent) });
}

/** @param {string} key */
export function removeRecent(key) {
  const { recent, favorites } = load();
  commit({ favorites, recent: recent.filter((item) => entryKey(item) !== key) });
}

export function clearRecent() {
  const { favorites } = load();
  commit({ favorites, recent: [] });
}

/** @param {string} key */
export function isFavorite(key) {
  return load().favorites.some((item) => entryKey(item) === key);
}

/**
 * 즐겨찾기 추가/해제. 추가되면 true.
 * @param {{ kind: SearchKind, world: string, name: string }} entry
 */
export function toggleFavorite(entry) {
  const clean = sanitize({ ...entry, at: Date.now() });
  if (!clean) return false;
  const key = entryKey(clean);
  const { recent, favorites } = load();
  if (favorites.some((item) => entryKey(item) === key)) {
    commit({ recent, favorites: favorites.filter((item) => entryKey(item) !== key) });
    return false;
  }
  commit({ recent, favorites: [clean, ...favorites].slice(0, LIMITS.favorites) });
  return true;
}

/** @param {() => void} listener */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// 다른 탭에서 바뀌면 다시 읽는다.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === KEYS.recent || event.key === KEYS.favorites) {
      state = { recent: read("recent"), favorites: read("favorites") };
      listeners.forEach((listener) => listener());
    }
  });
}

/** 최근 검색·즐겨찾기를 읽고, 바뀌면 다시 그린다. */
export function useSaved() {
  const [snapshot, setSnapshot] = useState(getSaved);
  useEffect(() => subscribe(() => setSnapshot(getSaved())), []);
  return snapshot;
}
