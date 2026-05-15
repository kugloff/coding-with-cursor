/**
 * Quick check for stripAnsi (no test runner required).
 * Run from repo root: node server/scripts/test-strip-ansi.mjs
 */
import assert from "node:assert/strict";
import { stripAnsi } from "../stripAnsi.js";

const sample =
  'File \x1b[35m"<stdin>"\x1b[0m, line \x1b[35m13\x1b[0m\n\x1b[1;35mRecursionError\x1b[0m: \x1b[35mmaximum recursion depth exceeded\x1b[0m';

const cleaned = stripAnsi(sample);

assert.equal(cleaned.includes("\x1b"), false, "no ESC bytes left");
assert.ok(cleaned.includes('File "<stdin>"'), "plain traceback text preserved");
assert.ok(cleaned.includes("RecursionError"), "error name preserved");

assert.equal(stripAnsi(""), "");
assert.equal(stripAnsi("hello"), "hello");

console.log("stripAnsi: OK");
console.log(cleaned);
