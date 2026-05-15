import {
  isValidWorkspaceFilename as isValidWorkspaceFilenameForEnv,
  normalizedWorkspaceRenameFromDraft,
  workspaceBasenameForRename,
} from "@shared/workspaceFilename.js";

export {
  isValidWorkspaceFilenameForEnv as isValidWorkspaceFilename,
  normalizedWorkspaceRenameFromDraft,
  workspaceBasenameForRename,
};

/** @param {string} name */
export function isValidJsWorkspaceFilename(name) {
  return isValidWorkspaceFilenameForEnv(name, "js");
}

/** @param {string} name */
export function isValidPyWorkspaceFilename(name) {
  return isValidWorkspaceFilenameForEnv(name, "python");
}

/** @param {string} name */
export function isValidCsWorkspaceFilename(name) {
  return isValidWorkspaceFilenameForEnv(name, "csharp");
}

/** @param {string} path */
export function workspaceJsBasenameForRename(path) {
  return workspaceBasenameForRename(path, "js");
}

/** @param {string} path */
export function workspacePyBasenameForRename(path) {
  return workspaceBasenameForRename(path, "python");
}

/** @param {string} path */
export function workspaceCsBasenameForRename(path) {
  return workspaceBasenameForRename(path, "csharp");
}

/** @param {string} draft */
export function normalizedJsWorkspaceRenameFromDraft(draft) {
  return normalizedWorkspaceRenameFromDraft(draft, "js");
}

/** @param {string} draft */
export function normalizedPyWorkspaceRenameFromDraft(draft) {
  return normalizedWorkspaceRenameFromDraft(draft, "python");
}

/** @param {string} draft */
export function normalizedCsWorkspaceRenameFromDraft(draft) {
  return normalizedWorkspaceRenameFromDraft(draft, "csharp");
}
