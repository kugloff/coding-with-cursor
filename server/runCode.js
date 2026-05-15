import { createRequire } from "node:module";
import { sanitizeRunDisplay } from "./stripAnsi.js";

const require = createRequire(import.meta.url);
const { VM } = require("vm2");

/** Max source length sent to POST /run (bytes-ish, string length). */
export const MAX_RUN_CODE_CHARS = 500_000;
/**
 * Wall-clock timeout for each vm2 `VM.run` (sync script only; see `allowAsync: false`).
 * Override with env `RUN_VM_TIMEOUT_MS` (integer ms, clamped 1–60000); default **1000**.
 */
function resolveRunTimeoutMs() {
  const raw = process.env.RUN_VM_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 1000;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return 1000;
  return Math.min(n, 60_000);
}

export const RUN_TIMEOUT_MS = resolveRunTimeoutMs();

/**
 * Run user JavaScript inside vm2 `VM`: isolated context, no Node `require` / `process` / `fs`
 * in the sandbox (only a stub `console` is injected). `eval` / `Function` code generation and
 * WebAssembly are disabled; async syntax is rejected so the timeout applies to synchronous work.
 * @param {string} code
 * @returns {{ output: string, error: string }}
 */
export function executeJavaScript(code) {
  const logLines = [];
  function captureLine(prefix, args) {
    const body = args.map((a) => {
      if (a === undefined) return "undefined";
      if (typeof a === "string") return a;
      try {
        return typeof a === "object" ? JSON.stringify(a) : String(a);
      } catch {
        return String(a);
      }
    });
    logLines.push(prefix ? `${prefix} ${body.join(" ")}` : body.join(" "));
  }

  const sandboxConsole = {
    log: (...args) => captureLine("", args),
    info: (...args) => captureLine("", args),
    warn: (...args) => captureLine("[warn]", args),
    error: (...args) => captureLine("[error]", args),
    debug: (...args) => captureLine("[debug]", args),
    trace: (...args) => captureLine("[trace]", args),
  };

  let output = "";
  let error = "";

  try {
    const vm = new VM({
      timeout: RUN_TIMEOUT_MS,
      sandbox: { console: sandboxConsole },
      eval: false,
      wasm: false,
      allowAsync: false,
      bufferAllocLimit: 1024 * 1024,
    });
    const wrapped = `"use strict";\n${code}`;
    const result = vm.run(wrapped);
    let tail = "";
    if (result !== undefined && result !== null) {
      if (typeof result === "object") {
        try {
          tail = JSON.stringify(result);
        } catch {
          tail = String(result);
        }
      } else {
        tail = String(result);
      }
    }
    const logText = logLines.join("\n");
    output = [logText, tail].filter(Boolean).join("\n");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    output = logLines.join("\n");
  }

  return sanitizeRunDisplay({ output, error });
}
