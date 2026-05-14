/**
 * Detects whether the model output is a plain-text reply or a JSON tool call
 * `{ "action": "edit_file", "filename", "content" }`.
 */

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
 * @param {unknown} obj
 * @returns {obj is { action: string, filename: string, content: string }}
 */
function isEditFileTool(obj) {
  return (
    obj !== null &&
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    obj.action === "edit_file" &&
    typeof obj.filename === "string" &&
    obj.filename.trim().length > 0 &&
    typeof obj.content === "string"
  );
}

/**
 * @param {string} raw Model output (trimmed or not)
 * @returns {{ response: string, toolCall: null } | { response: string, toolCall: { action: string, filename: string, content: string } }}
 */
export function parseAssistantModelOutput(raw) {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return { response: "", toolCall: null };
  }

  const candidate = stripOuterCodeFence(trimmed);

  if (!candidate.startsWith("{")) {
    return { response: trimmed, toolCall: null };
  }

  try {
    const obj = JSON.parse(candidate);
    if (isEditFileTool(obj)) {
      return {
        response: "",
        toolCall: {
          action: "edit_file",
          filename: obj.filename.trim(),
          content: obj.content,
        },
      };
    }
  } catch {
    // not valid JSON — treat whole output as plain text
  }

  return { response: trimmed, toolCall: null };
}
