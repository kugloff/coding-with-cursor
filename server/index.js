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
import {
  buildConvertedFilename,
  WORKSPACE_ENVIRONMENTS,
  normalizeWorkspaceEnvironmentFromBody,
  workspaceEnvironmentIdsLabel,
} from "../shared/workspaceEnvironments.js";
import { isValidWorkspaceFilename } from "../shared/workspaceFilename.js";
import { executeJavaScript, MAX_RUN_CODE_CHARS } from "./runCode.js";
import { executePython } from "./runPython.js";
import { executeCsharp } from "./runCsharp.js";
import { formatPythonWithBlack } from "./formatPython.js";
import { formatCsharpWithCSharpier } from "./formatCsharp.js";
import { buildRunResponse } from "./runMeta.js";

/** @type {import("../shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId[]} */
const SERVER_FORMAT_ENV_IDS = Object.keys(WORKSPACE_ENVIRONMENTS).filter(
  (id) => !WORKSPACE_ENVIRONMENTS[/** @type {import("../shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId} */ (id)]
    .formatInBrowser,
);

/** @type {Record<import("../shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId, (code: string) => { output: string, error: string }>} */
const RUN_EXECUTORS = {
  js: executeJavaScript,
  python: executePython,
  csharp: executeCsharp,
};

/** @type {Record<import("../shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId, (code: string) => { code: string, error: string }>} */
const FORMAT_EXECUTORS = {
  js: () => ({ code: "", error: "JavaScript formats in the browser." }),
  python: formatPythonWithBlack,
  csharp: formatCsharpWithCSharpier,
};

const ENV_IDS_LABEL = workspaceEnvironmentIdsLabel();

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
        `Expected JSON with a non-empty string "message". Optional: "files" (object path → content, empty strings OK), "currentFile" (string | null, active editor path), "mode" ("chat" | "agent" | "translate", default "chat"), "environment" (${ENV_IDS_LABEL}, default "js" — must match the client workspace; keys must use that environment's file extension).`,
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
  const environment = normalizeWorkspaceEnvironmentFromBody(body);

  if (typeof code !== "string") {
    return res.status(400).json({
      code: "",
      error: `Invalid request body: expected JSON with a string "code" field. Optional: "environment" (${ENV_IDS_LABEL}, default "js"); legacy "runtime" is accepted as a fallback.`,
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

  if (formatMeta.formatInBrowser) {
    return res.status(400).json({
      code: "",
      error: `${formatMeta.lang} is formatted in the browser with ${formatMeta.formatTool}. Use the editor Format button, or send environment ${SERVER_FORMAT_ENV_IDS.join(" or ")}.`,
    });
  }

  try {
    const { code: formatted, error } = FORMAT_EXECUTORS[environment](code);
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
  const environment = normalizeWorkspaceEnvironmentFromBody(body);

  if (typeof code !== "string") {
    return res.status(400).json({
      output: "",
      error: `Invalid request body: expected JSON with a string "code" field. Optional: "environment" (${ENV_IDS_LABEL}, default "js"); legacy "runtime" is accepted as a fallback.`,
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
    const run = RUN_EXECUTORS[environment];
    const { output, error } = run(code);
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
