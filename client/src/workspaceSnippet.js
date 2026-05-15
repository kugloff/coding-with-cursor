/** @param {string} filename */
export function markdownLangForWorkspaceFile(filename) {
  if (!filename) return "";
  const lower = filename.toLowerCase();
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".js")) return "javascript";
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md")) return "markdown";
  return "";
}

/**
 * GitHub-gist-style Markdown: titled section + fenced code block.
 * @param {string} filename
 * @param {string} content
 */
export function formatGistSnippet(filename, content) {
  const lang = markdownLangForWorkspaceFile(filename);
  const body = content ?? "";
  const fence = lang ? `\`\`\`${lang}` : "```";
  return `### ${filename}\n\n${fence}\n${body}\n\`\`\``;
}

/** One-line preview for the editor snippet strip. */
export function gistSnippetPreviewLine(filename) {
  const lang = markdownLangForWorkspaceFile(filename);
  if (!lang) return `\`\`\`  ${filename}`;
  return `\`\`\`${lang}  ${filename}`;
}
