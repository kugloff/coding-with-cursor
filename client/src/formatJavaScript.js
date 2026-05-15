import * as prettier from "prettier/standalone";
import * as prettierPluginBabel from "prettier/plugins/babel";
import * as prettierPluginEstree from "prettier/plugins/estree";

/**
 * Format JavaScript source with Prettier (browser).
 * Prettier 3+ `format` is async — must be awaited before updating the editor.
 * @param {string} code
 * @returns {Promise<string>}
 */
export async function formatJavaScript(code) {
  const result = await prettier.format(code, {
    parser: "babel",
    plugins: [prettierPluginBabel, prettierPluginEstree],
    printWidth: 80,
    semi: true,
    singleQuote: false,
    trailingComma: "es5",
  });
  if (typeof result !== "string") {
    throw new Error("Prettier did not return formatted text");
  }
  return result;
}
