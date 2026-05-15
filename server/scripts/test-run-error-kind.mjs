import assert from "node:assert/strict";
import { classifyRunError, buildRunResponse } from "../runMeta.js";

assert.equal(classifyRunError("Script execution timed out after 1000ms", "js"), "timeout");
assert.equal(
  classifyRunError("RecursionError: maximum recursion depth exceeded", "python"),
  "recursion",
);
assert.equal(classifyRunError("  File \"<stdin>\", line 1\n    SyntaxError: invalid syntax", "python"), "syntax");
assert.equal(classifyRunError("ReferenceError: x is not defined", "js"), "runtime");
assert.equal(classifyRunError("", "js"), null);

const r = buildRunResponse({
  output: "",
  error: "Python execution timed out.",
  environment: "python",
  durationMs: 1001,
});
assert.equal(r.runStatus, "timeout");
assert.equal(r.errorKind, "timeout");
assert.equal(r.errorLabel, "Timeout");

console.log("test-run-error-kind: ok");
