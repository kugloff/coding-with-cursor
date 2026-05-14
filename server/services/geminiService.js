import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseAssistantModelOutput } from "../assistantOutput.js";

const MODEL_NAME = "gemini-2.5-flash";

const RESPONSE_FORMAT_RULES = `How to format your reply:
- For explanations, questions, or chat: respond with plain text only (do not wrap in JSON).
- To replace an entire file in the user's workspace, respond with ONLY a single JSON object and nothing else (no markdown fences, no prose). Shape:
  {"action":"edit_file","filename":"<path>","content":"<full new file text>"}
  The "content" value must be a valid JSON string (escape quotes, newlines, etc.).`;

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
 * @param {Record<string, string>} files
 * @param {string | null | undefined} currentFile
 * @returns {string}
 */
function buildPromptWithFileContext(message, files, currentFile) {
  const parts = [];

  parts.push(
    "You are a helpful coding assistant. The user is working in a web-based editor with multiple in-memory files.",
    "Use the file contents below to answer questions about their code, suggest refactors, find bugs, or explain behavior.",
    "If a file is truncated, say so briefly if it affects your answer.",
    ""
  );

  const current =
    typeof currentFile === "string" && currentFile.trim()
      ? currentFile.trim()
      : null;
  parts.push(`Currently focused file: ${current ?? "(none)"}`, "");

  if (files && typeof files === "object") {
    const paths = Object.keys(files).sort((a, b) => a.localeCompare(b));
    let budget = MAX_CONTEXT_CHARS;

    for (const path of paths) {
      const raw = files[path];
      if (typeof raw !== "string") continue;

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

      const marker = current === path ? " (focused)" : "";
      parts.push(`--- File: ${path}${marker} ---`, body + truncated, "");

      if (budget <= 0) break;
    }
  }

  parts.push("--- User message ---", message.trim(), "", RESPONSE_FORMAT_RULES);
  return parts.join("\n");
}

/**
 * Calls Google Gemini with optional workspace file context.
 * @param {{ message: string, files?: Record<string, string>, currentFile?: string | null }} input
 * @returns {Promise<{ response: string, toolCall: null | { action: string, filename: string, content: string } }>}
 */
export async function generateResponse({ message, files, currentFile }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new GeminiConfigurationError(
      "GEMINI_API_KEY is missing or empty. Set it in the environment before calling the API."
    );
  }

  const hasContext =
    files &&
    typeof files === "object" &&
    Object.keys(files).length > 0 &&
    Object.values(files).some((v) => typeof v === "string" && v.length > 0);

  const prompt = hasContext
    ? buildPromptWithFileContext(message, files, currentFile)
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
