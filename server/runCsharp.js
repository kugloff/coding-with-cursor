import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitizeRunDisplay } from "./stripAnsi.js";

/** Max combined stdout/stderr bytes from one C# run (spawnSync `maxBuffer`). */
const CSHARP_MAX_BUFFER = 10 * 1024 * 1024;
const PROGRAM_FILE = "Program.cs";
const PROJECT_FILE = "RunSnippet.csproj";
const DEFAULT_RUN_TIMEOUT_MS = 30_000;
const DEFAULT_TFM = "net8.0";

function resolveCsharpTimeoutMs() {
  const raw = process.env.RUN_CSHARP_TIMEOUT_MS ?? process.env.RUN_PYTHON_TIMEOUT_MS;
  if (raw === undefined || raw === "") return DEFAULT_RUN_TIMEOUT_MS;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_RUN_TIMEOUT_MS;
  return Math.min(n, 120_000);
}

function resolveTargetFramework() {
  const raw = typeof process.env.DOTNET_TFM === "string" ? process.env.DOTNET_TFM.trim() : "";
  return raw || DEFAULT_TFM;
}

/**
 * @param {string} tfm
 */
function csprojContents(tfm) {
  return `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>${tfm}</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
`;
}

/**
 * @param {{ output?: string, error?: string }} partial
 */
function finish(partial) {
  return sanitizeRunDisplay({
    output: partial.output ?? "",
    error: partial.error ?? "",
  });
}

/**
 * @returns {string}
 */
function resolveDotnetExe() {
  const custom = typeof process.env.DOTNET_BIN === "string" ? process.env.DOTNET_BIN.trim() : "";
  return custom || "dotnet";
}

/**
 * Run user C# via `dotnet run` in a temporary console project.
 * Untrusted code — subprocess only; use only in trusted environments.
 * @param {string} code full .cs source (must be a compilable program)
 * @returns {{ output: string, error: string }}
 */
export function executeCsharp(code) {
  const timeout = resolveCsharpTimeoutMs();
  const dotnet = resolveDotnetExe();
  const tfm = resolveTargetFramework();

  let workDir;
  try {
    workDir = mkdtempSync(join(tmpdir(), "llm-csharp-run-"));
    writeFileSync(join(workDir, PROGRAM_FILE), code, "utf8");
    writeFileSync(join(workDir, PROJECT_FILE), csprojContents(tfm), "utf8");
  } catch (err) {
    return finish({
      output: "",
      error: err instanceof Error ? err.message : "Could not create temp project for C# run.",
    });
  }

  try {
    const result = spawnSync(dotnet, ["run", "--nologo", "--project", PROJECT_FILE], {
      encoding: "utf8",
      maxBuffer: CSHARP_MAX_BUFFER,
      timeout,
      windowsHide: true,
      cwd: workDir,
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
          error: `dotnet not found (${dotnet}). Install the .NET SDK or set DOTNET_BIN in the server environment.`,
        });
      }
      if (err.code === "ETIMEDOUT") {
        return finish({
          output: stdout,
          error: stderr.trim() || "C# execution timed out.",
        });
      }
      return finish({ output: stdout, error: err.message || String(err) });
    }

    if (result.signal) {
      const tail = stderr.trim() || `Process ended with signal ${result.signal}`;
      return finish({ output: stdout, error: tail });
    }

    if (result.status !== 0 && result.status !== null) {
      const errMsg = stderr.trim() || stdout.trim() || `Exit code ${result.status}`;
      return finish({ output: stdout, error: errMsg });
    }

    return finish({ output: stdout, error: stderr });
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

/** @returns {number} */
export function resolveCsharpRunTimeoutMs() {
  return resolveCsharpTimeoutMs();
}
