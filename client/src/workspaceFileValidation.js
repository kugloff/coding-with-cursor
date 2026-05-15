import { WORKSPACE_ENVIRONMENTS } from "@shared/workspaceEnvironments.js";
import {
  isValidWorkspaceFilename,
  normalizedWorkspaceRenameFromDraft,
} from "@shared/workspaceFilename.js";

/**
 * @param {Record<string, string> | string[]} filesOrPaths
 * @returns {string[]}
 */
function pathList(filesOrPaths) {
  if (Array.isArray(filesOrPaths)) return filesOrPaths;
  return Object.keys(filesOrPaths);
}

/**
 * @param {Record<string, string> | string[]} filesOrPaths
 * @returns {Set<string>}
 */
function pathSet(filesOrPaths) {
  return new Set(pathList(filesOrPaths));
}

/**
 * @param {import("@shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId} environment
 */
function extForEnv(environment) {
  return WORKSPACE_ENVIRONMENTS[environment]?.ext ?? ".txt";
}

/**
 * @param {unknown} name
 * @param {import("@shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId} [environment]
 */
export function validateWorkspaceFilename(name, environment = "js") {
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, message: "Filename cannot be empty." };
  }
  const t = name.trim();
  if (t.length > 1024) {
    return { ok: false, message: "Filename exceeds the maximum length (1024 characters)." };
  }
  if (/[/\\]/.test(t)) {
    return { ok: false, message: 'Filename cannot contain "/" or "\\".' };
  }
  if (!isValidWorkspaceFilename(t, environment)) {
    const ext = extForEnv(environment);
    return {
      ok: false,
      message: `Workspace files must be a single name ending in "${ext}".`,
    };
  }
  return { ok: true, filename: t };
}

/**
 * @param {unknown} name
 * @param {Record<string, string> | string[]} filesOrPaths
 * @param {import("@shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId} [environment]
 */
export function validateWorkspaceCreate(name, filesOrPaths, environment = "js") {
  const base = validateWorkspaceFilename(name, environment);
  if (!base.ok) return base;
  if (pathSet(filesOrPaths).has(base.filename)) {
    return { ok: false, message: `A file named "${base.filename}" already exists.` };
  }
  return { ok: true, filename: base.filename };
}

/**
 * @param {unknown} name
 * @param {Record<string, string>} files
 * @param {import("@shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId} [environment]
 */
export function validateWorkspaceExistingPath(name, files, environment = "js") {
  const base = validateWorkspaceFilename(name, environment);
  if (!base.ok) return base;
  if (!(base.filename in files)) {
    return { ok: false, message: `No file named "${base.filename}" in the workspace.` };
  }
  return { ok: true, filename: base.filename };
}

/**
 * @param {unknown} draft
 * @param {Record<string, string> | string[]} filesOrPaths
 * @param {string} oldPath
 * @param {import("@shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId} [environment]
 */
export function validateWorkspaceRename(draft, filesOrPaths, oldPath, environment = "js") {
  const set = pathSet(filesOrPaths);
  if (typeof oldPath !== "string" || !oldPath.trim() || !set.has(oldPath)) {
    return { ok: false, message: "Original file is not in the workspace." };
  }
  const next = normalizedWorkspaceRenameFromDraft(typeof draft === "string" ? draft : "", environment);
  const ext = extForEnv(environment);
  if (!next) {
    return {
      ok: false,
      message: `Enter a valid base name. The "${ext}" extension cannot be removed or replaced.`,
    };
  }
  if (next === oldPath) return { ok: true, filename: next };
  if (set.has(next)) {
    return { ok: false, message: `A file named "${next}" already exists.` };
  }
  return { ok: true, filename: next };
}

/**
 * @param {string} oldPath
 * @param {unknown} newResolvedName
 * @param {Record<string, string>} files
 * @param {import("@shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId} [environment]
 */
export function validateWorkspaceRenameTarget(oldPath, newResolvedName, files, environment = "js") {
  const set = pathSet(files);
  if (typeof oldPath !== "string" || !oldPath.trim() || !set.has(oldPath)) {
    return { ok: false, message: "Original file is not in the workspace." };
  }
  const base = validateWorkspaceFilename(newResolvedName, environment);
  if (!base.ok) return base;
  if (base.filename === oldPath) return { ok: true, filename: base.filename };
  if (set.has(base.filename)) {
    return { ok: false, message: `A file named "${base.filename}" already exists.` };
  }
  return { ok: true, filename: base.filename };
}

/**
 * @param {unknown} filename
 * @param {Record<string, string>} files
 * @param {"create_file" | "edit_file"} action
 * @param {import("@shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId} [environment]
 */
export function validateWorkspaceAiFileTarget(filename, files, action, environment = "js") {
  if (action === "create_file") {
    return validateWorkspaceCreate(filename, files, environment);
  }
  return validateWorkspaceFilename(filename, environment);
}
