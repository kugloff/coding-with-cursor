import { spawnSync } from "node:child_process";
import { MAX_RUN_CODE_CHARS } from "./runCode.js";

/** @typedef {{ code: string, error: string }} FormatResult */
/** @typedef {{ exe: string, args: string[], label: string }} BlackInvocation */

const FORMAT_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_FORMAT_TIMEOUT_MS = 15_000;
const BLACK_ARGS = ["-q", "-"];

function resolveFormatTimeoutMs() {
  const raw = process.env.FORMAT_PYTHON_TIMEOUT_MS;
  if (raw === undefined || raw === "") return DEFAULT_FORMAT_TIMEOUT_MS;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_FORMAT_TIMEOUT_MS;
  return Math.min(n, 60_000);
}

/**
 * Build ordered Black invocations (first success wins).
 * @returns {BlackInvocation[]}
 */
export function getBlackInvocationCandidates() {
  const custom = typeof process.env.BLACK_BIN === "string" ? process.env.BLACK_BIN.trim() : "";
  if (custom) {
    const parts = custom.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return [{ exe: "black", args: BLACK_ARGS, label: "black" }];
    }
    const exe = parts[0];
    const middle = parts.slice(1);
    const hasModule = middle[0] === "-m";
    const args = hasModule ? [...middle, ...BLACK_ARGS] : [...middle, ...BLACK_ARGS];
    return [{ exe, args, label: custom }];
  }

  const candidates = [{ exe: "black", args: BLACK_ARGS, label: "black" }];

  const pythonBin =
    typeof process.env.PYTHON_BIN === "string" && process.env.PYTHON_BIN.trim()
      ? process.env.PYTHON_BIN.trim()
      : null;

  if (pythonBin) {
    candidates.push({
      exe: pythonBin,
      args: ["-m", "black", ...BLACK_ARGS],
      label: `${pythonBin} -m black`,
    });
  }

  if (process.platform === "win32") {
    candidates.push({ exe: "py", args: ["-m", "black", ...BLACK_ARGS], label: "py -m black" });
    candidates.push({
      exe: "python",
      args: ["-m", "black", ...BLACK_ARGS],
      label: "python -m black",
    });
  } else {
    candidates.push({
      exe: "python3",
      args: ["-m", "black", ...BLACK_ARGS],
      label: "python3 -m black",
    });
    candidates.push({
      exe: "python",
      args: ["-m", "black", ...BLACK_ARGS],
      label: "python -m black",
    });
  }

  return candidates;
}

/**
 * @param {BlackInvocation} inv
 * @param {string} code
 * @param {number} timeout
 * @returns {{ ok: true, code: string } | { ok: false, enoent: boolean, error: string }}
 */
function runBlackInvocation(inv, code, timeout) {
  const result = spawnSync(inv.exe, inv.args, {
    input: code,
    encoding: "utf8",
    maxBuffer: FORMAT_MAX_BUFFER,
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
      return { ok: false, enoent: true, error: `${inv.label}: command not found` };
    }
    if (err.code === "ETIMEDOUT") {
      return {
        ok: false,
        enoent: false,
        error: stderr.trim() || `Black timed out (${inv.label}).`,
      };
    }
    return { ok: false, enoent: false, error: err.message || String(err) };
  }

  if (result.signal) {
    return {
      ok: false,
      enoent: false,
      error: stderr.trim() || `Black ended with signal ${result.signal} (${inv.label}).`,
    };
  }

  if (result.status !== 0 && result.status !== null) {
    return {
      ok: false,
      enoent: false,
      error: stderr.trim() || `Black exited with code ${result.status} (${inv.label}).`,
    };
  }

  return { ok: true, code: stdout };
}

/**
 * Format Python with Black (stdin → stdout). Tries `black`, then `py -m black` / `python -m black`.
 * @param {string} code
 * @returns {FormatResult}
 */
export function formatPythonWithBlack(code) {
  if (typeof code !== "string") {
    return { code: "", error: "Expected a string." };
  }
  if (code.length > MAX_RUN_CODE_CHARS) {
    return {
      code: "",
      error: `Code exceeds maximum length (${MAX_RUN_CODE_CHARS} characters).`,
    };
  }

  const timeout = resolveFormatTimeoutMs();
  const candidates = getBlackInvocationCandidates();
  const attempts = [];

  for (const inv of candidates) {
    const out = runBlackInvocation(inv, code, timeout);
    if (out.ok) {
      return { code: out.code, error: "" };
    }
    attempts.push(out.error);
    if (!out.enoent) {
      return { code: "", error: out.error };
    }
  }

  return {
    code: "",
    error: [
      "Black is not available. Install it where the Express server runs:",
      "  py -m pip install black",
      "  (or: pip install black)",
      "Optional: set BLACK_BIN in server/.env (e.g. py -m black or full path to black.exe).",
      attempts.length ? `Tried: ${attempts.join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
