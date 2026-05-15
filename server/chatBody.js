import {
  normalizeWorkspaceEnvironment,
  resolveTranslationTarget,
} from "../shared/workspaceEnvironments.js";
import { workspaceChatFileKeyErrorDetail } from "./workspaceFileValidation.js";

/**
 * @param {unknown} mode
 * @returns {"chat" | "agent" | "translate"}
 */
export function normalizeChatMode(mode) {
  if (typeof mode !== "string") return "chat";
  const t = mode.trim().toLowerCase();
  if (t === "agent") return "agent";
  if (t === "translate") return "translate";
  return "chat";
}

/**
 * @param {unknown} raw
 * @returns {"js" | "python"}
 */
export function normalizeChatEnvironment(raw) {
  return normalizeWorkspaceEnvironment(raw);
}

export { resolveTranslationTarget };

/**
 * Validates optional `files` and `currentFile` from POST /chat JSON body.
 * @param {unknown} files
 * @param {unknown} currentFile
 * @param {"js" | "python"} [environment]
 * @returns {{ ok: true, files?: Record<string, string>, currentFile?: string | null } | { ok: false, detail: string }}
 */
export function parseChatContext(files, currentFile, environment = "js") {
  let normalizedFiles;
  if (files === undefined || files === null) {
    normalizedFiles = undefined;
  } else if (typeof files !== "object" || Array.isArray(files)) {
    return { ok: false, detail: 'Optional "files" must be a JSON object mapping path strings to file content strings.' };
  } else {
    normalizedFiles = {};
    const entries = Object.entries(files);
    if (entries.length > 200) {
      return { ok: false, detail: "Too many files (maximum 200)." };
    }
    for (const [key, val] of entries) {
      if (typeof key !== "string" || !key.trim()) {
        return { ok: false, detail: "Each file key must be a non-empty string." };
      }
      if (key.length > 1024) {
        return { ok: false, detail: "A file path exceeds the maximum length (1024 characters)." };
      }
      const keyErr = workspaceChatFileKeyErrorDetail(key, environment);
      if (keyErr) {
        return { ok: false, detail: keyErr };
      }
      if (typeof val !== "string") {
        return {
          ok: false,
          detail: `File "${key.slice(0, 80)}${key.length > 80 ? "…" : ""}" content must be a string.`,
        };
      }
      normalizedFiles[key] = val;
    }
  }

  let normalizedCurrent = null;
  if (currentFile === undefined || currentFile === null) {
    normalizedCurrent = null;
  } else if (typeof currentFile !== "string") {
    return { ok: false, detail: 'Optional "currentFile" must be a string or null.' };
  } else {
    const t = currentFile.trim();
    normalizedCurrent = t.length ? t : null;
  }

  if (normalizedCurrent != null) {
    const curErr = workspaceChatFileKeyErrorDetail(normalizedCurrent, environment);
    if (curErr) {
      return { ok: false, detail: curErr };
    }
  }

  return { ok: true, files: normalizedFiles, currentFile: normalizedCurrent };
}
