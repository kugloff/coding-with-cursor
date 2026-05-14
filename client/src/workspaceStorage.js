import { isValidJsWorkspaceFilename } from "./workspaceFilename.js";

/** `localStorage` key for persisted `{ files, activePath }`. */
export const WORKSPACE_LOCAL_STORAGE_KEY = "llm:workspace:v1";

/**
 * @returns {{ files: Record<string, string>, activePath: string | null } | null}
 */
export function loadPersistedWorkspace() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(WORKSPACE_LOCAL_STORAGE_KEY);
    if (raw == null || raw === "") return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const filesIn = data.files;
    if (typeof filesIn !== "object" || filesIn === null || Array.isArray(filesIn)) return null;
    const files = {};
    for (const [k, v] of Object.entries(filesIn)) {
      if (!isValidJsWorkspaceFilename(k)) continue;
      if (typeof v !== "string") continue;
      files[k] = v;
    }
    const keys = Object.keys(files).sort((a, b) => a.localeCompare(b));
    if (keys.length === 0) return null;
    let ap =
      typeof data.activePath === "string" && data.activePath.trim()
        ? data.activePath.trim()
        : null;
    if (!ap || !(ap in files)) ap = keys[0];
    return { files, activePath: ap };
  } catch {
    return null;
  }
}

/**
 * @param {{ files: Record<string, string>, activePath: string | null }} workspace
 */
export function persistWorkspace(workspace) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      WORKSPACE_LOCAL_STORAGE_KEY,
      JSON.stringify({
        files: workspace.files,
        activePath: workspace.activePath,
      }),
    );
  } catch {
    // Quota, private mode, or disabled storage
  }
}

export function clearPersistedWorkspace() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(WORKSPACE_LOCAL_STORAGE_KEY);
  } catch {
    // ignore
  }
}
