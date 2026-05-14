import "./env.js";
import express from "express";
import cors from "cors";
import {
  generateResponse,
  GeminiConfigurationError,
  GeminiApiError,
} from "./services/geminiService.js";

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
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "express", timestamp: new Date().toISOString() });
});

app.get("/api/hello", (_req, res) => {
  res.json({ message: "Hello from the Express API" });
});

app.post("/chat", async (req, res) => {
  const { message } = req.body ?? {};

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({
      error: "Invalid request body",
      detail: 'Expected JSON: { "message": "<non-empty string>" }',
    });
  }

  try {
    const text = await generateResponse(message.trim());
    return res.json({ response: text });
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

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
