import "./env.js";
import express from "express";
import cors from "cors";
import {
  generateResponse,
  GeminiConfigurationError,
  GeminiApiError,
} from "./services/geminiService.js";
import { normalizeChatMode, parseChatContext } from "./chatBody.js";
import { executeJavaScript, MAX_RUN_CODE_CHARS } from "./runCode.js";

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
  const { message, files: rawFiles, currentFile: rawCurrentFile, mode: rawMode } = body;
  const mode = normalizeChatMode(rawMode);

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({
      error: "Invalid request body",
      detail:
        'Expected JSON with a non-empty string "message". Optional: "files" (object path → content, empty strings OK), "currentFile" (string | null, active editor path), "mode" ("chat" | "agent", default "chat").',
    });
  }

  const parsed = parseChatContext(rawFiles, rawCurrentFile);
  if (!parsed.ok) {
    return res.status(400).json({
      error: "Invalid request body",
      detail: parsed.detail,
    });
  }

  try {
    const result = await generateResponse({
      message: message.trim(),
      files: parsed.files,
      currentFile: parsed.currentFile,
      mode,
    });
    return res.json({
      response: result.response ?? "",
      toolCall: result.toolCall ?? null,
      mode,
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

app.post("/run", (req, res) => {
  const body = req.body ?? {};
  const { code } = body;

  if (typeof code !== "string") {
    return res.status(400).json({
      output: "",
      error: 'Invalid request body: expected JSON with a string "code" field.',
    });
  }

  if (code.length > MAX_RUN_CODE_CHARS) {
    return res.status(400).json({
      output: "",
      error: `Code exceeds maximum length (${MAX_RUN_CODE_CHARS} characters).`,
    });
  }

  try {
    const { output, error } = executeJavaScript(code);
    return res.json({
      output: typeof output === "string" ? output : String(output ?? ""),
      error: typeof error === "string" ? error : String(error ?? ""),
    });
  } catch (err) {
    console.error("POST /run unexpected error:", err);
    return res.status(500).json({
      output: "",
      error: "Internal error while executing code.",
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
