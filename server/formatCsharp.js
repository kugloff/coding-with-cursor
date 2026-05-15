import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_RUN_CODE_CHARS } from "./runCode.js";

/** @typedef {{ code: string, error: string }} FormatResult */
/** @typedef {{ exe: string, args: string[], label: string }} CSharpierInvocation */

const FORMAT_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_FORMAT_TIMEOUT_MS = 15_000;
const TEMP_FILE = "snippet.cs";

function resolveFormatTimeoutMs() {
  const raw = process.env.FORMAT_CSHARP_TIMEOUT_MS ?? process.env.FORMAT_PYTHON_TIMEOUT_MS;
  if (raw === undefined || raw === "") return DEFAULT_FORMAT_TIMEOUT_MS;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_FORMAT_TIMEOUT_MS;
  return Math.min(n, 60_000);
}

/**
 * @param {string} filePath absolute path to .cs file
 * @returns {string[]}
 */
function formatArgsForFile(filePath) {
  return ["format", filePath, "--log-level", "Error"];
}

/**
 * Build ordered CSharpier invocations (first success wins).
 * @returns {CSharpierInvocation[]}
 */
export function getCSharpierInvocationCandidates() {
  const custom = typeof process.env.CSHARPIER_BIN === "string" ? process.env.CSHARPIER_BIN.trim() : "";
  if (custom) {
    const parts = custom.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return [{ exe: "csharpier", args: ["format"], label: "csharpier" }];
    }
    const exe = parts[0];
    const middle = parts.slice(1);
    const hasFormat = middle.includes("format");
    const args = hasFormat ? middle : ["format", ...middle];
    return [{ exe, args, label: custom }];
  }

  const candidates = [
    { exe: "csharpier", args: ["format"], label: "csharpier" },
    { exe: "dotnet", args: ["csharpier", "format"], label: "dotnet csharpier" },
  ];

  if (process.platform === "win32") {
    candidates.push({
      exe: "dotnet",
      args: ["tool", "run", "csharpier", "--", "format"],
      label: "dotnet tool run csharpier",
    });
  }

  return candidates;
}

/**
 * @param {CSharpierInvocation} inv
 * @param {string} filePath
 * @param {string} workDir
 * @param {number} timeout
 * @returns {{ ok: true, code: string } | { ok: false, enoent: boolean, error: string }}
 */
function runCSharpierOnFile(inv, filePath, workDir, timeout) {
  const args = [...inv.args, filePath, "--log-level", "Error"];
  const result = spawnSync(inv.exe, args, {
    encoding: "utf8",
    maxBuffer: FORMAT_MAX_BUFFER,
    timeout,
    windowsHide: true,
    cwd: workDir,
  });

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
        error: stderr.trim() || `CSharpier timed out (${inv.label}).`,
      };
    }
    return { ok: false, enoent: false, error: err.message || String(err) };
  }

  if (result.signal) {
    return {
      ok: false,
      enoent: false,
      error: stderr.trim() || `CSharpier ended with signal ${result.signal} (${inv.label}).`,
    };
  }

  if (result.status !== 0 && result.status !== null) {
    return {
      ok: false,
      enoent: false,
      error: stderr.trim() || `CSharpier exited with code ${result.status} (${inv.label}).`,
    };
  }

  try {
    const code = readFileSync(filePath, "utf8");
    return { ok: true, code };
  } catch (readErr) {
    return {
      ok: false,
      enoent: false,
      error: readErr instanceof Error ? readErr.message : "Could not read formatted file.",
    };
  }
}

/**
 * Format C# with CSharpier (temp file → format in place). Tries `csharpier`, then `dotnet csharpier`, etc.
 * @param {string} code
 * @returns {FormatResult}
 */
export function formatCsharpWithCSharpier(code) {
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
  const candidates = getCSharpierInvocationCandidates();
  const attempts = [];

  let workDir;
  let filePath;
  try {
    workDir = mkdtempSync(join(tmpdir(), "llm-csharpier-"));
    filePath = join(workDir, TEMP_FILE);
    writeFileSync(filePath, code, "utf8");
  } catch (err) {
    return {
      code: "",
      error: err instanceof Error ? err.message : "Could not create temp file for formatting.",
    };
  }

  try {
    for (const inv of candidates) {
      const out = runCSharpierOnFile(inv, filePath, workDir, timeout);
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
        "CSharpier is not available. Install it where the Express server runs:",
        "  dotnet tool install -g csharpier",
        "  (requires .NET SDK; then `csharpier` on PATH)",
        "Optional: set CSHARPIER_BIN in server/.env (e.g. csharpier).",
        attempts.length ? `Tried: ${attempts.join("; ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
