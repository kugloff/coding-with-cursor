import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseAssistantModelOutput } from "../assistantOutput.js";

const MODEL_NAME = "gemini-2.0-flash";

const CHAT_MODE_RULES_JS = `CHAT MODE — read-only assistant (no workspace writes via this API):
- Reply in natural language only. Do NOT output edit_file or create_file JSON, and do NOT output any JSON object meant as a machine action.
- You may use normal Markdown (including fenced code blocks) only to explain or illustrate ideas. Code in fences is for discussion; it does not modify the user's files.
- This workspace is JavaScript-only (.js file tabs). Use the provided file contents to answer questions, suggest refactors, or explain behavior in prose.
- Never pretend you have applied edits to the repository; the user applies changes manually unless a different product mode is used.`;

const CHAT_MODE_RULES_PY = `CHAT MODE — read-only assistant (no workspace writes via this API):
- Reply in natural language only. Do NOT output edit_file or create_file JSON, and do NOT output any JSON object meant as a machine action.
- You may use normal Markdown (including fenced code blocks) only to explain or illustrate ideas. Code in fences is for discussion; it does not modify the user's files.
- This workspace is Python-only (.py file tabs). Use the provided file contents to answer questions, suggest refactors, or explain behavior in prose.
- Never pretend you have applied edits to the repository; the user applies changes manually unless a different product mode is used.`;

const AGENT_MODE_RULES_JS = `AGENT MODE — workspace editing agent (structured output only):
- Output MUST be exactly one JSON object and nothing else: no prose before or after, no markdown fences, no commentary, no labels.
- This workspace is JavaScript-only: every path ends with ".js"; file bodies in "content" must be plain JavaScript only.
- To replace an entire existing file, use ONLY:
  {"action":"edit_file","filename":"<path>","content":"<full new file text>"}
  "filename" must match an exact path from the project file list (or the active file path) and MUST end with ".js".
- To add a new file, use ONLY:
  {"action":"create_file","filename":"<name>.js","content":"<full new file text>"}
  Filename MUST end with ".js" (single basename: no slashes or backslashes). If the path already exists, use edit_file instead.
- "content" must be a valid JSON string (escape quotes, newlines, etc.).
- Do not include any text outside the single JSON object.`;

const AGENT_MODE_RULES_PY = `AGENT MODE — workspace editing agent (structured output only):
- Output MUST be exactly one JSON object and nothing else: no prose before or after, no markdown fences, no commentary, no labels.
- This workspace is Python-only: every path ends with ".py"; file bodies in "content" must be plain Python only.
- To replace an entire existing file, use ONLY:
  {"action":"edit_file","filename":"<path>","content":"<full new file text>"}
  "filename" must match an exact path from the project file list (or the active file path) and MUST end with ".py".
- To add a new file, use ONLY:
  {"action":"create_file","filename":"<name>.py","content":"<full new file text>"}
  Filename MUST end with ".py" (single basename: no slashes or backslashes). If the path already exists, use edit_file instead.
- "content" must be a valid JSON string (escape quotes, newlines, etc.).
- Do not include any text outside the single JSON object.`;

/**
 * @param {"chat" | "agent"} mode
 * @param {"js" | "python"} environment
 */
function rulesForModeAndEnvironment(mode, environment) {
  const env = environment === "python" ? "python" : "js";
  if (mode === "agent") {
    return env === "python" ? AGENT_MODE_RULES_PY : AGENT_MODE_RULES_JS;
  }
  return env === "python" ? CHAT_MODE_RULES_PY : CHAT_MODE_RULES_JS;
}

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
 * @param {"chat" | "agent"} mode
 * @param {"js" | "python"} environment
 * @returns {string}
 */
function buildPromptWithFileContext(message, files, currentFile, mode, environment) {
  const env = environment === "python" ? "python" : "js";
  const fileMap = files && typeof files === "object" && !Array.isArray(files) ? files : {};
  const pathsSorted = Object.keys(fileMap)
    .filter((p) => typeof fileMap[p] === "string")
    .sort((a, b) => a.localeCompare(b));

  const current =
    typeof currentFile === "string" && currentFile.trim() ? currentFile.trim() : null;

  const parts = [];

  if (mode === "agent") {
    parts.push(
      env === "python"
        ? "You are a workspace editing agent for a web-based Python editor."
        : "You are a workspace editing agent for a web-based JavaScript editor.",
      "Your ONLY task is to output exactly one JSON object: either edit_file or create_file, per the AGENT MODE rules at the end. No prose, no markdown fences, no explanations.",
      "The client will parse your entire reply as that single JSON value.",
      ""
    );
  } else {
    parts.push(
      env === "python"
        ? "You are a helpful coding assistant in CHAT MODE. The user is working in a web-based editor with multiple in-memory .py files."
        : "You are a helpful coding assistant in CHAT MODE. The user is working in a web-based editor with multiple in-memory .js files.",
      "You must NOT output edit_file, create_file, or any other machine-action JSON. Answer in natural language only; use Markdown (including fenced code) only to explain.",
      "Use the sections below to answer questions about their code, suggest refactors, find bugs, or explain behavior.",
      "The ACTIVE editor file is named explicitly; treat the user's question as about that file unless they clearly refer to another path from the project list.",
      "If a file is truncated, say so briefly if it affects your answer.",
      ""
    );
  }

  parts.push(
    "--- Project file list (exact paths; use these strings for edit_file.filename when in agent mode) ---",
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

  parts.push(
    "--- User message ---",
    message.trim(),
    "",
    rulesForModeAndEnvironment(mode, env)
  );
  return parts.join("\n");
}

/**
 * Calls Google Gemini with optional workspace file context.
 * @param {{ message: string, files?: Record<string, string>, currentFile?: string | null, mode?: "chat" | "agent", environment?: "js" | "python" }} input
 *   `environment` selects JavaScript (`.js`) vs Python (`.py`) workspace rules and tool validation; default **`"js"`**.
 * @returns {Promise<{ response: string, toolCall: null | { action: "edit_file" | "create_file", filename: string, content: string } }>}
 */
export async function generateResponse({ message, files, currentFile, mode = "chat", environment = "js" }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new GeminiConfigurationError(
      "GEMINI_API_KEY is missing or empty. Set it in the environment before calling the API."
    );
  }

  const modeNorm = mode === "agent" ? "agent" : "chat";
  const envNorm = environment === "python" ? "python" : "js";

  const fileMap = files && typeof files === "object" && !Array.isArray(files) ? files : {};
  const hasAnyFileKeys = Object.keys(fileMap).some((k) => typeof fileMap[k] === "string");
  const hasActivePath =
    typeof currentFile === "string" && currentFile.trim().length > 0;
  const hasContext = hasAnyFileKeys || hasActivePath;

  const prompt = hasContext
    ? buildPromptWithFileContext(message, fileMap, currentFile, modeNorm, envNorm)
    : `${rulesForModeAndEnvironment(modeNorm, envNorm)}\n\n--- User message ---\n${message.trim()}`;

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

  if (modeNorm === "chat") {
    return { response: text.trim(), toolCall: null };
  }

  const parsed = parseAssistantModelOutput(text, envNorm);
  if (parsed.toolCall) {
    return parsed;
  }
  throw new GeminiApiError(
    "Agent mode: expected a single edit_file or create_file JSON object with no surrounding text."
  );
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
