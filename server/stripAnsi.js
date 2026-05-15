/**
 * Remove ANSI escape sequences (terminal colors/styles) for plain-text UI display.
 * @see https://en.wikipedia.org/wiki/ANSI_escape_code
 */

/** CSI and related ESC sequences (colors, bold, cursor, etc.). */
const ANSI_ESCAPE = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/**
 * @param {unknown} text
 * @returns {string}
 */
export function stripAnsi(text) {
  if (typeof text !== "string" || text.length === 0) return "";
  return text.replace(ANSI_ESCAPE, "");
}

/**
 * @param {{ output: string, error: string }} result
 * @returns {{ output: string, error: string }}
 */
export function sanitizeRunDisplay(result) {
  return {
    output: stripAnsi(result.output),
    error: stripAnsi(result.error),
  };
}
