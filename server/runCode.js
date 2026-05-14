import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { VM } = require("vm2");

/** Max source length sent to POST /run (bytes-ish, string length). */
export const MAX_RUN_CODE_CHARS = 500_000;
/** Wall-clock timeout for each run (vm2). */
export const RUN_TIMEOUT_MS = 10_000;

/**
 * Run user JavaScript inside vm2 with a stub console and strict mode.
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

  return { output, error };
}
