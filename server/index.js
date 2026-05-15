import "./env.js";
import express from "express";
import cors from "cors";
import {
  generateResponse,
  GEMINI_MODEL_FALLBACK_CHAIN,
  GeminiConfigurationError,
  GeminiApiError,
} from "./services/geminiService.js";
import {
  normalizeChatMode,
  normalizeChatEnvironment,
  parseChatContext,
  resolveTranslationTarget,
} from "./chatBody.js";
import { buildConvertedFilename, WORKSPACE_ENVIRONMENTS } from "../shared/workspaceEnvironments.js";
import { isValidWorkspaceFilename } from "../shared/workspaceFilename.js";
import { executeJavaScript, MAX_RUN_CODE_CHARS } from "./runCode.js";
import { executePython } from "./runPython.js";
import { formatPythonWithBlack } from "./formatPython.js";
import { formatCsharpWithCSharpier } from "./formatCsharp.js";
import { buildRunResponse } from "./runMeta.js";

/**
 * POST /run execution target: prefers `environment`, falls back to legacy `runtime`.
 * @param {Record<string, unknown>} body
 * @returns {"js" | "python"}
 */
function normalizeRunEnvironment(body) {
  const rawEnv = typeof body?.environment === "string" ? body.environment.trim().toLowerCase() : "";
  if (rawEnv === "python") return "python";
  if (rawEnv === "csharp" || rawEnv === "c#") return "csharp";
  if (rawEnv === "js" || rawEnv === "javascript") return "js";
  const rawRt = typeof body?.runtime === "string" ? body.runtime.trim().toLowerCase() : "";
  if (rawRt === "python") return "python";
  if (rawRt === "csharp" || rawRt === "c#") return "csharp";
  return "js";
}

const app = express();
const PORT = process.env.PORT || 3001;

const clientOrigin =
  process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "express", timestamp: new Date().toISOString() });
});

app.get("/api/hello", (_req, res) => {
  res.json({ message: "Hello from the Express API" });
});

app.post("/chat", async (req, res) => {
  const body = req.body ?? {};
  const {
    message,
    files: rawFiles,
    currentFile: rawCurrentFile,
    mode: rawMode,
    environment: rawEnv,
    targetEnvironment: rawTargetEnv,
    expectedFilename: rawExpectedFilename,
    targetFiles: rawTargetFiles,
  } = body;
  const mode = normalizeChatMode(rawMode);
  const environment = normalizeChatEnvironment(rawEnv);

  const messageText = typeof message === "string" ? message.trim() : "";
  if (mode !== "translate" && !messageText) {
    return res.status(400).json({
      error: "Invalid request body",
      detail:
        'Expected JSON with a non-empty string "message". Optional: "files" (object path → content, empty strings OK), "currentFile" (string | null, active editor path), "mode" ("chat" | "agent" | "translate", default "chat"), "environment" ("js" | "python", default "js" — must match the client workspace; keys must be *.js or *.py accordingly).',
    });
  }

  const parsed = parseChatContext(rawFiles, rawCurrentFile, environment);
  if (!parsed.ok) {
    return res.status(400).json({
      error: "Invalid request body",
      detail: parsed.detail,
    });
  }

  let targetEnvironment;
  let expectedFilename;

  if (mode === "translate") {
    const targetResolved = resolveTranslationTarget(environment, rawTargetEnv);
    if (!targetResolved.ok) {
      return res.status(400).json({ error: "Invalid request body", detail: targetResolved.detail });
    }
    targetEnvironment = targetResolved.targetEnvironment;

    const sourceFile =
      typeof parsed.currentFile === "string" && parsed.currentFile.trim()
        ? parsed.currentFile.trim()
        : null;
    if (!sourceFile) {
      return res.status(400).json({
        error: "Invalid request body",
        detail: "Translate mode requires an active source file (currentFile).",
      });
    }

    let targetFileMap = {};
    if (rawTargetFiles !== undefined && rawTargetFiles !== null) {
      const targetParsed = parseChatContext(rawTargetFiles, null, targetEnvironment);
      if (!targetParsed.ok) {
        return res.status(400).json({ error: "Invalid request body", detail: targetParsed.detail });
      }
      targetFileMap = targetParsed.files ?? {};
    }

    if (typeof rawExpectedFilename === "string" && rawExpectedFilename.trim()) {
      expectedFilename = rawExpectedFilename.trim();
      if (!isValidWorkspaceFilename(expectedFilename, targetEnvironment)) {
        const ext = WORKSPACE_ENVIRONMENTS[targetEnvironment]?.ext ?? ".txt";
        return res.status(400).json({
          error: "Invalid request body",
          detail: `expectedFilename must be a valid *${ext} name.`,
        });
      }
    } else {
      expectedFilename = buildConvertedFilename(sourceFile, environment, targetEnvironment, targetFileMap);
    }
  }

  const translateMessage =
    messageText ||
    (mode === "translate"
      ? `Translate the active file to ${WORKSPACE_ENVIRONMENTS[targetEnvironment]?.lang ?? targetEnvironment}.`
      : "");

  try {
    const result = await generateResponse({
      message: translateMessage,
      files: parsed.files,
      currentFile: parsed.currentFile,
      mode,
      environment,
      targetEnvironment,
      expectedFilename,
    });
    return res.json({
      response: result.response ?? "",
      toolCall: result.toolCall ?? null,
      mode,
      environment,
      ...(mode === "translate" ? { targetEnvironment, expectedFilename } : {}),
      model: result.modelId ?? GEMINI_MODEL_FALLBACK_CHAIN[0],
      modelFallback: Boolean(result.modelFallback),
      modelChain: GEMINI_MODEL_FALLBACK_CHAIN,
    });
  } catch (err) {
    if (err instanceof GeminiConfigurationError) {
      return res.status(500).json({
        error: "Server configuration error",
        detail: err.message,
      });
    }

    if (err instanceof GeminiApiError) {
      const status =
        typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600
          ? err.statusCode
          : 502;
      return res.status(status).json({
        error: "Gemini API error",
        detail: err.message,
      });
    }

    console.error("POST /chat unexpected error:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: "An unexpected error occurred while processing the chat request.",
    });
  }
});

app.post("/format", (req, res) => {
  const body = req.body ?? {};
  const { code } = body;
  const environment = normalizeRunEnvironment(body);

  if (typeof code !== "string") {
    return res.status(400).json({
      code: "",
      error:
        'Invalid request body: expected JSON with a string "code" field. Optional: "environment" ("js" | "python" | "csharp", default "js"); legacy "runtime" is accepted as a fallback.',
    });
  }

  if (code.length > MAX_RUN_CODE_CHARS) {
    return res.status(400).json({
      code: "",
      error: `Code exceeds maximum length (${MAX_RUN_CODE_CHARS} characters).`,
    });
  }

  const formatMeta = WORKSPACE_ENVIRONMENTS[environment];
  if (!formatMeta?.formatSupported) {
    const lang = formatMeta?.lang ?? environment;
    return res.status(400).json({
      code: "",
      error: `Formatting is not available for ${lang} in this app yet.`,
    });
  }

  if (environment === "js") {
    return res.status(400).json({
      code: "",
      error:
        "JavaScript is formatted in the browser with Prettier. Use the editor Format button, or send environment python or csharp.",
    });
  }

  try {
    const { code: formatted, error } =
      environment === "csharp" ? formatCsharpWithCSharpier(code) : formatPythonWithBlack(code);
    return res.json({
      code: typeof formatted === "string" ? formatted : "",
      error: typeof error === "string" ? error : String(error ?? ""),
    });
  } catch (err) {
    console.error("POST /format unexpected error:", err);
    return res.status(500).json({
      code: "",
      error: "Internal error while formatting code.",
    });
  }
});

app.post("/run", (req, res) => {
  const body = req.body ?? {};
  const { code } = body;
  const environment = normalizeRunEnvironment(body);

  if (typeof code !== "string") {
    return res.status(400).json({
      output: "",
      error:
        'Invalid request body: expected JSON with a string "code" field. Optional: "environment" ("js" | "python" | "csharp", default "js"); legacy "runtime" is accepted as a fallback.',
    });
  }

  if (code.length > MAX_RUN_CODE_CHARS) {
    return res.status(400).json({
      output: "",
      error: `Code exceeds maximum length (${MAX_RUN_CODE_CHARS} characters).`,
    });
  }

  const runMeta = WORKSPACE_ENVIRONMENTS[environment];
  if (!runMeta?.runSupported) {
    const lang = runMeta?.lang ?? environment;
    return res.status(400).json({
      output: "",
      error: `Run is not available for ${lang} in this app yet.`,
    });
  }

  try {
    const t0 = performance.now();
    const { output, error } =
      environment === "python" ? executePython(code) : executeJavaScript(code);
    const durationMs = performance.now() - t0;
    return res.json(
      buildRunResponse({
        output: typeof output === "string" ? output : String(output ?? ""),
        error: typeof error === "string" ? error : String(error ?? ""),
        environment,
        durationMs,
      }),
    );
  } catch (err) {
    console.error("POST /run unexpected error:", err);
    return res.status(500).json(
      buildRunResponse({
        output: "",
        error: "Internal error while executing code.",
        environment,
        durationMs: 0,
      }),
    );
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
