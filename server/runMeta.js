import { RUN_TIMEOUT_MS } from "./runCode.js";

/** @typedef {"timeout" | "recursion" | "syntax" | "runtime" | "config" | "other"} RunErrorKind */
/** @typedef {"ok" | "error" | "timeout"} RunStatus */

export const RUN_ERROR_LABELS = {
  timeout: "Timeout",
  recursion: "Recursion limit",
  syntax: "Syntax error",
  runtime: "Runtime error",
  config: "Configuration",
  other: "Error",
};

function resolvePythonTimeoutMs() {
  const raw = process.env.RUN_PYTHON_TIMEOUT_MS;
  if (raw === undefined || raw === "") return RUN_TIMEOUT_MS;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return RUN_TIMEOUT_MS;
  return Math.min(n, 60_000);
}

/**
 * @param {"js" | "python"} environment
 */
export function timeoutMsForRunEnvironment(environment) {
  return environment === "python" ? resolvePythonTimeoutMs() : RUN_TIMEOUT_MS;
}

/**
 * @param {string} error
 * @param {"js" | "python"} environment
 * @returns {RunErrorKind | null}
 */
export function classifyRunError(error, environment) {
  if (typeof error !== "string" || !error.trim()) return null;

  const lower = error.toLowerCase();

  if (
    /timed out|timeout after|execution timed out|etimedout|script execution timed out/i.test(
      error,
    )
  ) {
    return "timeout";
  }

  if (
    /recursionerror|maximum recursion depth|maximum call stack|stack overflow/i.test(
      lower,
    )
  ) {
    return "recursion";
  }

  if (environment === "python") {
    if (/syntaxerror|indentationerror|taberror/.test(lower)) return "syntax";
  } else if (/syntaxerror|unexpected token|unexpected identifier|invalid or unexpected token/.test(lower)) {
    return "syntax";
  }

  if (environment === "python" && /python not found/.test(lower)) {
    return "config";
  }

  return "runtime";
}

/**
 * @param {{ output: string, error: string, environment: "js" | "python", durationMs: number }} params
 */
export function buildRunResponse({ output, error, environment, durationMs }) {
  const timeoutMs = timeoutMsForRunEnvironment(environment);
  const err = typeof error === "string" ? error : String(error ?? "");
  const out = typeof output === "string" ? output : String(output ?? "");
  const errorKind = classifyRunError(err, environment);
  /** @type {RunStatus} */
  let runStatus = "ok";
  if (errorKind === "timeout") runStatus = "timeout";
  else if (err.trim()) runStatus = "error";

  return {
    output: out,
    error: err,
    durationMs: Math.max(0, Math.round(durationMs)),
    timeoutMs,
    runStatus,
    errorKind,
    errorLabel: errorKind ? RUN_ERROR_LABELS[errorKind] : null,
  };
}
