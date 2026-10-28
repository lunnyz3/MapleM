// 테마: 저장값(수동 전환)이 있으면 그 값, 없으면 시스템 설정(prefers-color-scheme).
import { useEffect, useState } from "preact/hooks";

/** @typedef {"light" | "dark"} Theme */

const THEME_KEY = "mmp.theme";
const THEME_COLORS = { light: "#EAF3FF", dark: "#17182B" };

/** @returns {Theme | null} */
function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemQuery() {
  return typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
}

/** @returns {Theme} */
function effectiveTheme() {
  return readStoredTheme() || (systemQuery()?.matches ? "dark" : "light");
}

/** @param {Theme} theme */
function syncThemeColor(theme) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

/** @param {Theme} theme */
function storeTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // 저장할 수 없으면 이번 방문 동안만 적용한다.
  }
  syncThemeColor(theme);
}

/** @returns {[Theme, () => void]} */
export function useTheme() {
  const [theme, setTheme] = useState(effectiveTheme);

  useEffect(() => {
    syncThemeColor(theme);
    const query = systemQuery();
    if (!query) return undefined;
    const onChange = () => {
      if (!readStoredTheme()) setTheme(query.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => syncThemeColor(theme), [theme]);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    storeTheme(next);
    setTheme(next);
  };

  return [theme, toggle];
}
