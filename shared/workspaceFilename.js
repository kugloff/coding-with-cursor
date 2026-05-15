import { WORKSPACE_ENVIRONMENTS, isWorkspaceEnvironmentId } from "./workspaceEnvironments.js";

/**
 * @param {string} name
 * @param {import("./workspaceEnvironments.types.js").WorkspaceEnvironmentId} envId
 */
export function isValidWorkspaceFilename(name, envId) {
  if (!isWorkspaceEnvironmentId(envId)) return false;
  const meta = WORKSPACE_ENVIRONMENTS[envId];
  if (typeof name !== "string") return false;
  const t = name.trim();
  if (!t || t.length > 1024) return false;
  if (/[/\\]/.test(t)) return false;
  const ext = meta.ext;
  return t.length > ext.length && t.slice(-ext.length).toLowerCase() === ext.toLowerCase();
}

/**
 * @param {string} path
 * @param {import("./workspaceEnvironments.types.js").WorkspaceEnvironmentId} envId
 */
export function workspaceBasenameForRename(path, envId) {
  if (!isWorkspaceEnvironmentId(envId)) return "";
  const ext = WORKSPACE_ENVIRONMENTS[envId].ext;
  if (typeof path !== "string" || !path.trim()) return "";
  const lower = path.toLowerCase();
  if (lower.endsWith(ext.toLowerCase())) {
    return path.slice(0, -ext.length);
  }
  return path;
}

/**
 * @param {string} draft
 * @param {import("./workspaceEnvironments.types.js").WorkspaceEnvironmentId} envId
 * @returns {string | null}
 */
export function normalizedWorkspaceRenameFromDraft(draft, envId) {
  if (!isWorkspaceEnvironmentId(envId)) return null;
  const ext = WORKSPACE_ENVIRONMENTS[envId].ext;
  const t = typeof draft === "string" ? draft.trim() : "";
  if (!t || /[/\\]/.test(t)) return null;
  const stem = t.includes(".") ? t.slice(0, t.lastIndexOf(".")).trim() : t;
  if (!stem) return null;
  const out = `${stem}${ext}`;
  if (out.length > 1024) return null;
  return isValidWorkspaceFilename(out, envId) ? out : null;
}
