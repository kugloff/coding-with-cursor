/**
 * Detects whether the model output is a plain-text reply or a JSON tool call
 * (`edit_file` or `create_file` with `filename` + `content`).
 */

import { isValidWorkspaceFilename } from "../shared/workspaceFilename.js";
import { WORKSPACE_ENVIRONMENTS } from "../shared/workspaceEnvironments.js";

/**
 * Strip a single leading/trailing markdown ``` fence if present.
 * @param {string} s
 * @returns {string}
 */
function stripOuterCodeFence(s) {
  let t = s.trim();
  const block = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i;
  const m = t.match(block);
  if (m) return m[1].trim();
  return t;
}

/**
 * @param {unknown} filename
 * @returns {string | null} trimmed filename or null if invalid
 */
function normalizeToolFilename(filename) {
  if (typeof filename !== "string") return null;
  const t = filename.trim();
  if (!t || t.length > 1024) return null;
  if (/[/\\]/.test(t)) return null;
  return t;
}

/**
 * @param {unknown} obj
 * @param {"edit_file" | "create_file"} action
 * @returns {obj is { action: string, filename: string, content: string }}
 */
function isFileTool(obj, action) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return false;
  if (obj.action !== action) return false;
  const name = normalizeToolFilename(obj.filename);
  if (!name) return false;
  return typeof obj.content === "string";
}

/**
 * @param {import("../shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId} environment
 */
function isValidToolWorkspaceName(name, environment) {
  return isValidWorkspaceFilename(name, environment);
}

/**
 * @param {string} raw Model output (trimmed or not)
 * @param {"js" | "python"} [environment]
 * @returns {{ response: string, toolCall: null } | { response: string, toolCall: { action: string, filename: string, content: string } }}
 */
export function parseAssistantModelOutput(raw, environment = "js") {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return { response: "", toolCall: null };
  }

  const candidate = stripOuterCodeFence(trimmed);

  if (!candidate.startsWith("{")) {
    return { response: trimmed, toolCall: null };
  }

  const meta = WORKSPACE_ENVIRONMENTS[environment] ?? WORKSPACE_ENVIRONMENTS.js;
  const ext = meta.ext;
  const lang = meta.lang;

  try {
    const obj = JSON.parse(candidate);
    if (isFileTool(obj, "create_file")) {
      const name = normalizeToolFilename(obj.filename);
      if (!name) {
        return { response: trimmed, toolCall: null };
      }
      if (!isValidToolWorkspaceName(name, environment)) {
        return {
          response: `Workspace only allows ${lang} files named with a "${ext}" extension. Ignored create_file for "${name}". Reply in plain text or retry with a valid filename and ${lang}-only content.`,
          toolCall: null,
        };
      }
      return {
        response: "",
        toolCall: {
          action: "create_file",
          filename: name,
          content: obj.content,
        },
      };
    }
    if (isFileTool(obj, "edit_file")) {
      const name = normalizeToolFilename(obj.filename);
      if (!name) {
        return { response: trimmed, toolCall: null };
      }
      if (!isValidToolWorkspaceName(name, environment)) {
        return {
          response: `Workspace only allows ${lang} files named with a "${ext}" extension. Ignored edit_file for "${name}". Use an existing path from the project list that ends in ${ext}, or explain changes in plain text.`,
          toolCall: null,
        };
      }
      return {
        response: "",
        toolCall: {
          action: "edit_file",
          filename: name,
          content: obj.content,
        },
      };
    }
  } catch {
    // not valid JSON — treat whole output as plain text
  }

  return { response: trimmed, toolCall: null };
}
