import {
  isValidJsWorkspaceFilename,
  normalizedJsWorkspaceRenameFromDraft,
} from "./workspaceFilename.js";

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
 * Non-empty, no path separators, max length, ends with `.js`.
 * @param {unknown} name
 * @returns {{ ok: true, filename: string } | { ok: false, message: string }}
 */
export function validateWorkspaceFilename(name) {
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
  if (!isValidJsWorkspaceFilename(t)) {
    return { ok: false, message: 'Workspace files must be a single name ending in ".js".' };
  }
  return { ok: true, filename: t };
}

/**
 * Valid `.js` name and not already present (for create / AI create_file).
 * @param {unknown} name
 * @param {Record<string, string> | string[]} filesOrPaths
 */
export function validateWorkspaceCreate(name, filesOrPaths) {
  const base = validateWorkspaceFilename(name);
  if (!base.ok) return base;
  if (pathSet(filesOrPaths).has(base.filename)) {
    return { ok: false, message: `A file named "${base.filename}" already exists.` };
  }
  return { ok: true, filename: base.filename };
}

/**
 * Valid `.js` name and must exist (optional guard for delete / strict edit).
 * @param {unknown} name
 * @param {Record<string, string>} files
 */
export function validateWorkspaceExistingPath(name, files) {
  const base = validateWorkspaceFilename(name);
  if (!base.ok) return base;
  if (!(base.filename in files)) {
    return { ok: false, message: `No file named "${base.filename}" in the workspace.` };
  }
  return { ok: true, filename: base.filename };
}

/**
 * Rename: normalize draft to `*.js`, block duplicates, allow no-op same name.
 * @param {unknown} draft
 * @param {Record<string, string> | string[]} filesOrPaths
 * @param {string} oldPath
 */
export function validateWorkspaceRename(draft, filesOrPaths, oldPath) {
  const set = pathSet(filesOrPaths);
  if (typeof oldPath !== "string" || !oldPath.trim() || !set.has(oldPath)) {
    return { ok: false, message: "Original file is not in the workspace." };
  }
  const next = normalizedJsWorkspaceRenameFromDraft(
    typeof draft === "string" ? draft : "",
  );
  if (!next) {
    return {
      ok: false,
      message: 'Enter a valid base name. The ".js" extension cannot be removed or replaced.',
    };
  }
  if (next === oldPath) return { ok: true, filename: next };
  if (set.has(next)) {
    return { ok: false, message: `A file named "${next}" already exists.` };
  }
  return { ok: true, filename: next };
}

/**
 * Validate a rename after the new name is already normalized (defense in `handleRenameFile`).
 * @param {string} oldPath
 * @param {unknown} newResolvedName
 * @param {Record<string, string>} files
 */
export function validateWorkspaceRenameTarget(oldPath, newResolvedName, files) {
  const set = pathSet(files);
  if (typeof oldPath !== "string" || !oldPath.trim() || !set.has(oldPath)) {
    return { ok: false, message: "Original file is not in the workspace." };
  }
  const base = validateWorkspaceFilename(newResolvedName);
  if (!base.ok) return base;
  if (base.filename === oldPath) return { ok: true, filename: base.filename };
  if (set.has(base.filename)) {
    return { ok: false, message: `A file named "${base.filename}" already exists.` };
  }
  return { ok: true, filename: base.filename };
}

/**
 * Apply AI file tool: enforce name rules; block duplicate on create only.
 * @param {unknown} filename
 * @param {Record<string, string>} files
 * @param {"create_file" | "edit_file"} action
 */
export function validateWorkspaceAiFileTarget(filename, files, action) {
  if (action === "create_file") {
    return validateWorkspaceCreate(filename, files);
  }
  return validateWorkspaceFilename(filename);
}
