import { spawnSync } from "node:child_process";
import { RUN_TIMEOUT_MS } from "./runCode.js";
import { sanitizeRunDisplay } from "./stripAnsi.js";

/** Max combined stdout/stderr bytes from one Python run (spawnSync `maxBuffer`). */
const PYTHON_MAX_BUFFER = 10 * 1024 * 1024;

function resolvePythonTimeoutMs() {
  const raw = process.env.RUN_PYTHON_TIMEOUT_MS;
  if (raw === undefined || raw === "") return RUN_TIMEOUT_MS;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return RUN_TIMEOUT_MS;
  return Math.min(n, 60_000);
}

/**
 * @param {{ output?: string, error?: string }} partial
 * @returns {{ output: string, error: string }}
 */
function finish(partial) {
  return sanitizeRunDisplay({
    output: partial.output ?? "",
    error: partial.error ?? "",
  });
}

/**
 * Run user Python as a subprocess: stdin script, `-I` isolated, sync only.
 * Untrusted code — weaker isolation than vm2; use only in trusted environments.
 * @param {string} code
 * @returns {{ output: string, error: string }}
 */
export function executePython(code) {
  const timeout = resolvePythonTimeoutMs();
  const exe =
    typeof process.env.PYTHON_BIN === "string" && process.env.PYTHON_BIN.trim()
      ? process.env.PYTHON_BIN.trim()
      : process.platform === "win32"
        ? "python"
        : "python3";

  const result = spawnSync(exe, ["-I", "-u", "-"], {
    input: code,
    encoding: "utf8",
    maxBuffer: PYTHON_MAX_BUFFER,
    timeout,
    windowsHide: true,
  });

  const stdout =
    result.stdout === null || result.stdout === undefined ? "" : String(result.stdout);
  const stderr =
    result.stderr === null || result.stderr === undefined ? "" : String(result.stderr);

  if (result.error) {
    const err = result.error;
    if (err.code === "ENOENT") {
      return finish({
        output: "",
        error: `Python not found (${exe}). Install Python 3 or set PYTHON_BIN in the server environment.`,
      });
    }
    if (err.code === "ETIMEDOUT") {
      return finish({
        output: stdout,
        error: stderr.trim() || "Python execution timed out.",
      });
    }
    return finish({ output: stdout, error: err.message || String(err) });
  }

  if (result.signal) {
    const tail = stderr.trim() || `Process ended with signal ${result.signal}`;
    return finish({ output: stdout, error: tail });
  }

  if (result.status !== 0 && result.status !== null) {
    const errMsg = stderr.trim() || `Exit code ${result.status}`;
    return finish({ output: stdout, error: errMsg });
  }

  return finish({ output: stdout, error: stderr });
}
