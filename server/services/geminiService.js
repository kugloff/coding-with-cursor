import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseAssistantModelOutput } from "../assistantOutput.js";

const MODEL_NAME = "gemini-2.5-flash";

const RESPONSE_FORMAT_RULES = `How to format your reply:
- For explanations, questions, or chat: respond with plain text only (do not wrap in JSON).
- To replace an entire existing file, respond with ONLY a single JSON object and nothing else (no markdown fences, no prose). Shape:
  {"action":"edit_file","filename":"<path>","content":"<full new file text>"}
  Use "edit_file" when the path already exists in the project file list (or you are overwriting the active file). The "filename" must match an exact path from the list (or the active file path).
- To add a new file that does not exist yet, use ONLY this shape:
  {"action":"create_file","filename":"<path>","content":"<full new file text>"}
  Use a simple filename (no slashes or backslashes). Do not use "create_file" for paths that already exist — use "edit_file" instead.
- The "content" value must be a valid JSON string (escape quotes, newlines, etc.).`;

/** Total characters of file bodies included in the prompt (soft cap). */
const MAX_CONTEXT_CHARS = 200_000;
/** Max characters per file before truncation. */
const MAX_FILE_CHARS = 120_000;

export class GeminiConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "GeminiConfigurationError";
  }
}

export class GeminiApiError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown, statusCode?: number }} [options]
   */
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "GeminiApiError";
    this.statusCode = options.statusCode;
  }
}

/**
 * Append file body respecting per-file and total context limits; returns remaining character budget.
 * @param {string[]} parts
 * @param {string | undefined} raw
 * @param {number} budget
 * @returns {number}
 */
function appendFileBody(parts, raw, budget) {
  if (typeof raw !== "string") {
    parts.push("[content was not provided for this path]", "");
    return budget;
  }
  let body = raw;
  let truncated = "";
  if (body.length > MAX_FILE_CHARS) {
    body = body.slice(0, MAX_FILE_CHARS);
    truncated = "\n[…truncated: file exceeded per-file limit]";
  }
  if (body.length > budget) {
    body = body.slice(0, budget);
    truncated += "\n[…truncated: workspace context limit]";
    budget = 0;
  } else {
    budget -= body.length;
  }
  parts.push(body + truncated, "");
  return budget;
}

/**
 * @param {Record<string, string>} files
 * @param {string | null | undefined} currentFile
 * @returns {string}
 */
function buildPromptWithFileContext(message, files, currentFile) {
  const fileMap = files && typeof files === "object" && !Array.isArray(files) ? files : {};
  const pathsSorted = Object.keys(fileMap)
    .filter((p) => typeof fileMap[p] === "string")
    .sort((a, b) => a.localeCompare(b));

  const current =
    typeof currentFile === "string" && currentFile.trim() ? currentFile.trim() : null;

  const parts = [];

  parts.push(
    "You are a helpful coding assistant. The user is working in a web-based editor with multiple in-memory files.",
    "Use the sections below to answer questions about their code, suggest refactors, find bugs, or explain behavior.",
    "The ACTIVE editor file is named explicitly; treat the user's question as about that file unless they clearly refer to another path from the project list.",
    "If a file is truncated, say so briefly if it affects your answer.",
    ""
  );

  parts.push(
    "--- Project file list (exact paths; use these strings for edit_file.filename) ---",
    pathsSorted.length ? pathsSorted.join(", ") : "(no files in workspace payload)",
    ""
  );

  parts.push("--- Active editor file (filename only) ---", current ?? "(none — no file is focused)", "");

  let budget = MAX_CONTEXT_CHARS;

  if (current) {
    parts.push(
      "--- Current file (full content; this is the focused tab in the editor) ---",
      `Filename: ${current}`,
      ""
    );
    const activeRaw = fileMap[current];
    if (activeRaw === undefined) {
      parts.push(
        "[Note: this path is not present in the files map — the client did not send content for it.]",
        ""
      );
    } else {
      budget = appendFileBody(parts, activeRaw, budget);
    }
  }

  const others = pathsSorted.filter((p) => p !== current);
  if (others.length > 0 && budget > 0) {
    parts.push("--- Other workspace files ---", "");
    for (const path of others) {
      if (budget <= 0) break;
      parts.push(`Filename: ${path}`, "");
      budget = appendFileBody(parts, fileMap[path], budget);
    }
  }

  parts.push("--- User message ---", message.trim(), "", RESPONSE_FORMAT_RULES);
  return parts.join("\n");
}

/**
 * Calls Google Gemini with optional workspace file context.
 * @param {{ message: string, files?: Record<string, string>, currentFile?: string | null }} input
 *   `files` maps path → content (empty strings allowed). `currentFile` selects the active tab; its body is placed first in the prompt when present in `files`.
 * @returns {Promise<{ response: string, toolCall: null | { action: "edit_file" | "create_file", filename: string, content: string } }>}
 */
export async function generateResponse({ message, files, currentFile }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new GeminiConfigurationError(
      "GEMINI_API_KEY is missing or empty. Set it in the environment before calling the API."
    );
  }

  const fileMap = files && typeof files === "object" && !Array.isArray(files) ? files : {};
  const hasAnyFileKeys = Object.keys(fileMap).some((k) => typeof fileMap[k] === "string");
  const hasActivePath =
    typeof currentFile === "string" && currentFile.trim().length > 0;
  const hasContext = hasAnyFileKeys || hasActivePath;

  const prompt = hasContext
    ? buildPromptWithFileContext(message, fileMap, currentFile)
    : `${RESPONSE_FORMAT_RULES}\n\n--- User message ---\n${message.trim()}`;

  const genAI = new GoogleGenerativeAI(apiKey.trim());
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (err) {
    throw mapUpstreamError(err);
  }

  const apiResponse = result?.response;
  if (!apiResponse) {
    throw new GeminiApiError("Gemini returned no response object");
  }

  let text;
  try {
    text = apiResponse.text();
  } catch (err) {
    throw new GeminiApiError("Failed to read text from Gemini response", {
      cause: err,
    });
  }

  if (typeof text !== "string" || !text.trim()) {
    throw new GeminiApiError("Gemini returned empty text");
  }

  const parsed = parseAssistantModelOutput(text);
  if (!parsed.toolCall && !parsed.response.trim()) {
    throw new GeminiApiError("Gemini returned empty text");
  }

  return parsed;
}

/**
 * @param {unknown} err
 * @returns {GeminiApiError}
 */
function mapUpstreamError(err) {
  const status = pickStatus(err);
  const detail = pickMessage(err);

  if (status === 401 || status === 403) {
    return new GeminiApiError(
      "Gemini API rejected the request (check GEMINI_API_KEY).",
      { cause: err, statusCode: status }
    );
  }

  if (status === 429) {
    return new GeminiApiError("Gemini API rate limit exceeded. Try again later.", {
      cause: err,
      statusCode: 429,
    });
  }

  if (status != null && status >= 500) {
    return new GeminiApiError("Gemini API is temporarily unavailable.", {
      cause: err,
      statusCode: 502,
    });
  }

  return new GeminiApiError(detail || "Gemini API request failed", {
    cause: err,
    statusCode: status && status >= 400 ? status : 502,
  });
}

/**
 * @param {unknown} err
 * @returns {number | undefined}
 */
function pickStatus(err) {
  if (err && typeof err === "object") {
    if ("status" in err && typeof err.status === "number") return err.status;
    if (
      "error" in err &&
      err.error &&
      typeof err.error === "object" &&
      "code" in err.error &&
      typeof err.error.code === "number"
    ) {
      return err.error.code;
    }
  }
  return undefined;
}

/**
 * @param {unknown} err
 * @returns {string | undefined}
 */
function pickMessage(err) {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return undefined;
}
