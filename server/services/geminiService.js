import { GoogleGenerativeAI } from "@google/generative-ai";
import { WORKSPACE_ENVIRONMENTS } from "../../shared/workspaceEnvironments.js";
import { parseAssistantModelOutput } from "../assistantOutput.js";

/** Try in order; last entry is the final fallback. */
export const GEMINI_MODEL_FALLBACK_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-2.5-pro",
];

/**
 * @param {"chat" | "agent" | "translate"} mode
 * @param {"js" | "python"} environment
 * @param {{ targetEnvironment?: "js" | "python", expectedFilename?: string, sourceFile?: string | null }} [translateOpts]
 */
function rulesForModeAndEnvironment(mode, environment, translateOpts = {}) {
  const env = environment === "python" ? "python" : "js";
  const { ext, lang } = WORKSPACE_ENVIRONMENTS[env];
  const extNoDot = ext.slice(1);

  if (mode === "translate") {
    const targetEnv = translateOpts.targetEnvironment === "python" ? "python" : "js";
    const target = WORKSPACE_ENVIRONMENTS[targetEnv];
    const sourcePath = translateOpts.sourceFile?.trim() || "(active)";
    const expected = translateOpts.expectedFilename?.trim() || `name${target.ext}`;
    const targetExtNoDot = target.ext.slice(1);
    return `TRANSLATE (${lang} → ${target.lang}):
- Port the source file to idiomatic ${target.lang}. Source: [active] (${sourcePath}). Target workspace is separate (not ${lang}).
- Exactly one JSON object; no prose, fences, or labels outside JSON.
- "content" = full ${target.lang} file body as a JSON string (escape quotes and newlines).
- Required output path: "${expected}" (must match exactly).
- If "${expected}" already exists in the target workspace, use edit_file; otherwise create_file.
- create_file: {"action":"create_file","filename":"${expected}","content":"..."}
- edit_file: {"action":"edit_file","filename":"${expected}","content":"..."}
- Language in "content" must be ${target.lang} only (*.${targetExtNoDot}). Do not emit ${lang} or *.${extNoDot}.`;
  }

  if (mode === "agent") {
    return `AGENT (${lang}, *.${extNoDot}):
- Exactly one JSON object in the reply; no prose, fences, or labels.
- "content" = full file body as a JSON string (escape quotes and newlines).
- edit_file (existing path): {"action":"edit_file","filename":"<path from [paths]>","content":"..."}
- create_file (new basename only, no /): {"action":"create_file","filename":"name.${extNoDot}","content":"..."}
- If the path already exists, use edit_file. Language in "content" must be ${lang} only.`;
  }
  return `CHAT (${lang}, *.${extNoDot}):
- Natural language only; no edit_file/create_file or other action JSON.
- Markdown/fenced code for explanation only (not applied to the workspace).
- Use file sections below; default to [active] unless the user names another path.
- Do not claim files were modified. Mention truncation briefly if it affects the answer.`;
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
    parts.push("[missing]", "");
    return budget;
  }
  let body = raw;
  let truncated = "";
  if (body.length > MAX_FILE_CHARS) {
    body = body.slice(0, MAX_FILE_CHARS);
    truncated = "\n[truncated: per-file cap]";
  }
  if (body.length > budget) {
    body = body.slice(0, budget);
    truncated += "\n[truncated: context cap]";
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
 * @param {"chat" | "agent" | "translate"} mode
 * @param {"js" | "python"} environment
 * @param {{ targetEnvironment?: "js" | "python", expectedFilename?: string, sourceFile?: string | null }} [translateOpts]
 * @returns {string}
 */
function buildPromptWithFileContext(message, files, currentFile, mode, environment, translateOpts = {}) {
  const env = environment === "python" ? "python" : "js";
  const fileMap = files && typeof files === "object" && !Array.isArray(files) ? files : {};
  const pathsSorted = Object.keys(fileMap)
    .filter((p) => typeof fileMap[p] === "string")
    .sort((a, b) => a.localeCompare(b));

  const current =
    typeof currentFile === "string" && currentFile.trim() ? currentFile.trim() : null;

  const { lang } = WORKSPACE_ENVIRONMENTS[env];
  const intro =
    mode === "translate"
      ? `${lang} → ${WORKSPACE_ENVIRONMENTS[translateOpts.targetEnvironment === "python" ? "python" : "js"].lang} translate — one create_file or edit_file JSON for the target workspace (rules at end).`
      : mode === "agent"
        ? `${lang} workspace agent — one edit_file or create_file JSON (rules at end).`
        : `${lang} workspace assistant — chat only (rules at end).`;
  const parts = [
    intro,
    "[paths]",
    pathsSorted.length ? pathsSorted.join(", ") : "(none)",
    "[active]",
    current ?? "(none)",
    "",
  ];

  let budget = MAX_CONTEXT_CHARS;

  if (current) {
    parts.push(`[file ${current}]`, "");
    const activeRaw = fileMap[current];
    if (activeRaw === undefined) {
      parts.push("[content not in payload]", "");
    } else {
      budget = appendFileBody(parts, activeRaw, budget);
    }
  }

  const others = pathsSorted.filter((p) => p !== current);
  if (others.length > 0 && budget > 0) {
    for (const path of others) {
      if (budget <= 0) break;
      parts.push(`[file ${path}]`, "");
      budget = appendFileBody(parts, fileMap[path], budget);
    }
  }

  if (mode === "translate") {
    parts.push(
      "[translate-target]",
      WORKSPACE_ENVIRONMENTS[translateOpts.targetEnvironment === "python" ? "python" : "js"].lang,
      "[output-filename]",
      translateOpts.expectedFilename?.trim() || "",
      "",
    );
  }

  parts.push("[user]", message.trim(), "", rulesForModeAndEnvironment(mode, env, translateOpts));
  return parts.join("\n");
}

/**
 * Calls Google Gemini with optional workspace file context.
 * @param {{ message: string, files?: Record<string, string>, currentFile?: string | null, mode?: "chat" | "agent" | "translate", environment?: "js" | "python", targetEnvironment?: "js" | "python", expectedFilename?: string }} input
 *   `environment` is the **source** workspace for translate; tool JSON is validated against **`targetEnvironment`**.
 * @returns {Promise<{ response: string, toolCall: null | { action: "edit_file" | "create_file", filename: string, content: string }, modelId: string, modelFallback: boolean }>}
 */
export async function generateResponse({
  message,
  files,
  currentFile,
  mode = "chat",
  environment = "js",
  targetEnvironment,
  expectedFilename,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new GeminiConfigurationError(
      "GEMINI_API_KEY is missing or empty. Set it in the environment before calling the API."
    );
  }

  const modeNorm = mode === "agent" ? "agent" : mode === "translate" ? "translate" : "chat";
  const envNorm = environment === "python" ? "python" : "js";
  const targetNorm = targetEnvironment === "python" ? "python" : "js";
  const translateOpts =
    modeNorm === "translate"
      ? {
          targetEnvironment: targetNorm,
          expectedFilename: typeof expectedFilename === "string" ? expectedFilename : "",
          sourceFile: typeof currentFile === "string" ? currentFile : null,
        }
      : {};

  const fileMap = files && typeof files === "object" && !Array.isArray(files) ? files : {};
  const hasAnyFileKeys = Object.keys(fileMap).some((k) => typeof fileMap[k] === "string");
  const hasActivePath =
    typeof currentFile === "string" && currentFile.trim().length > 0;
  const hasContext = hasAnyFileKeys || hasActivePath;

  const prompt = hasContext
    ? buildPromptWithFileContext(message, fileMap, currentFile, modeNorm, envNorm, translateOpts)
    : `${rulesForModeAndEnvironment(modeNorm, envNorm, translateOpts)}\n\n[user]\n${message.trim()}`;

  const genAI = new GoogleGenerativeAI(apiKey.trim());
  const { text, modelId } = await generateContentWithModelFallback(genAI, prompt);
  const modelFallback = GEMINI_MODEL_FALLBACK_CHAIN.indexOf(modelId) > 0;
  const modelMeta = { modelId, modelFallback };

  if (modeNorm === "chat") {
    return { response: text.trim(), toolCall: null, ...modelMeta };
  }

  const toolEnv = modeNorm === "translate" ? targetNorm : envNorm;
  const parsed = parseAssistantModelOutput(text, toolEnv);
  if (parsed.toolCall) {
    if (modeNorm === "translate" && typeof expectedFilename === "string" && expectedFilename.trim()) {
      const expected = expectedFilename.trim();
      if (parsed.toolCall.filename !== expected) {
        throw new GeminiApiError(
          `Translate mode: model returned filename "${parsed.toolCall.filename}" but required "${expected}".`
        );
      }
    }
    return { ...parsed, ...modelMeta };
  }
  const modeLabel = modeNorm === "translate" ? "Translate" : "Agent";
  throw new GeminiApiError(
    `${modeLabel} mode: expected a single edit_file or create_file JSON object with no surrounding text.`
  );
}

/**
 * @param {import("@google/generative-ai").GoogleGenerativeAI} genAI
 * @param {string} prompt
 * @returns {Promise<{ text: string, modelId: string }>}
 */
async function generateContentWithModelFallback(genAI, prompt) {
  /** @type {{ modelId: string, err: GeminiApiError }[]} */
  const failures = [];

  for (let i = 0; i < GEMINI_MODEL_FALLBACK_CHAIN.length; i++) {
    const modelId = GEMINI_MODEL_FALLBACK_CHAIN[i];
    if (i > 0) {
      console.warn(
        `Gemini: trying ${modelId} after ${failures[failures.length - 1].modelId} failed (${failures[failures.length - 1].err.message})`,
      );
    }

    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent(prompt);
      const text = readTextFromGenerateResult(result, modelId);
      if (i > 0) {
        console.warn(`Gemini: succeeded with fallback model ${modelId}`);
      }
      return { text, modelId };
    } catch (err) {
      const mapped =
        err instanceof GeminiApiError ? err : mapUpstreamError(err);
      failures.push({ modelId, err: mapped });
      if (!shouldRetryNextModel(mapped, i)) {
        throw mapped;
      }
    }
  }

  throw buildAllModelsFailedError(failures);
}

/**
 * @param {unknown} result
 * @param {string} modelId
 * @returns {string}
 */
function readTextFromGenerateResult(result, modelId) {
  const apiResponse = result?.response;
  if (!apiResponse) {
    throw new GeminiApiError(`Gemini (${modelId}) returned no response object`);
  }
  let text;
  try {
    text = apiResponse.text();
  } catch (err) {
    throw new GeminiApiError(`Failed to read text from Gemini (${modelId})`, {
      cause: err,
    });
  }
  if (typeof text !== "string" || !text.trim()) {
    throw new GeminiApiError(`Gemini (${modelId}) returned empty text`);
  }
  return text.trim();
}

/**
 * @param {GeminiApiError} err
 * @param {number} index index in GEMINI_MODEL_FALLBACK_CHAIN
 */
function shouldRetryNextModel(err, index) {
  if (index >= GEMINI_MODEL_FALLBACK_CHAIN.length - 1) return false;
  const status = err.statusCode;
  if (status === 401 || status === 403) return false;
  if (status === 400) return false;
  return true;
}

/**
 * @param {{ modelId: string, err: GeminiApiError }[]} failures
 * @returns {GeminiApiError}
 */
function buildAllModelsFailedError(failures) {
  const detail = failures.map((f) => `${f.modelId}: ${f.err.message}`).join("; ");
  const last = failures[failures.length - 1]?.err;
  return new GeminiApiError(
    `All Gemini models failed (${GEMINI_MODEL_FALLBACK_CHAIN.join(" → ")}). ${detail}`,
    { cause: last, statusCode: last?.statusCode ?? 502 },
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
