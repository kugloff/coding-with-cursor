/** Browser persistence for UI color theme. */
export const THEME_STORAGE_KEY = "llm:theme:v1";

/** @typedef {"dark" | "light"} AppTheme */

/** @returns {AppTheme} */
export function loadTheme() {
  if (typeof window === "undefined") return "dark";
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* private mode / disabled storage */
  }
  return "dark";
}

/** @param {AppTheme} theme */
export function persistTheme(theme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** @param {AppTheme} theme */
export function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  document.documentElement.style.colorScheme = t;
}

/** @param {AppTheme} theme */
export function monacoThemeForAppTheme(theme) {
  return theme === "light" ? "light" : "vs-dark";
}
