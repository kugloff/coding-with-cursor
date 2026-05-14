/**
 * Virtual in-editor workspace: single-segment paths ending in `.js` only (case-insensitive).
 * @param {string} name
 * @returns {boolean}
 */
export function isValidJsWorkspaceFilename(name) {
  if (typeof name !== "string") return false;
  const t = name.trim();
  if (!t || t.length > 1024) return false;
  if (/[/\\]/.test(t)) return false;
  return /\.js$/i.test(t);
}

/**
 * Strip trailing `.js` (case-insensitive) from a workspace path for rename UI. Keep in sync with `client/src/workspaceFilename.js`.
 * @param {string} path
 * @returns {string}
 */
export function workspaceJsBasenameForRename(path) {
  if (typeof path !== "string" || !path.trim()) return "";
  return path.replace(/\.js$/i, "");
}

/**
 * Build final `*.js` path from a rename draft (same rules as client). Keep in sync with `client/src/workspaceFilename.js`.
 * @param {string} draft
 * @returns {string | null}
 */
export function normalizedJsWorkspaceRenameFromDraft(draft) {
  const t = typeof draft === "string" ? draft.trim() : "";
  if (!t || /[/\\]/.test(t)) return null;
  const stem = t.includes(".") ? t.slice(0, t.lastIndexOf(".")).trim() : t;
  if (!stem) return null;
  const out = `${stem}.js`;
  if (out.length > 1024) return null;
  return isValidJsWorkspaceFilename(out) ? out : null;
}
