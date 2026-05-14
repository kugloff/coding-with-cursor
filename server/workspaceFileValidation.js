import { isValidJsWorkspaceFilename } from "./workspaceFilename.js";

/**
 * Human-readable reason if a chat `files` key is not allowed, or `null` if OK.
 * @param {string} key
 * @returns {string | null}
 */
export function workspaceChatFileKeyErrorDetail(key) {
  if (typeof key !== "string" || !key.trim()) {
    return "Each file key must be a non-empty string.";
  }
  if (key.length > 1024) {
    return "A file path exceeds the maximum length (1024 characters).";
  }
  if (!isValidJsWorkspaceFilename(key)) {
    return `Workspace paths must be a single filename ending in ".js". Invalid key: "${key.slice(0, 80)}${key.length > 80 ? "…" : ""}".`;
  }
  return null;
}
