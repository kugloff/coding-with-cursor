import JSZip from "jszip";

function stampForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * @param {Record<string, string>} files
 * @param {string} folderName optional prefix inside the zip
 */
function addFilesToZip(zip, files, folderName) {
  const base = folderName ? zip.folder(folderName) : zip;
  if (!base) return;
  for (const [path, content] of Object.entries(files)) {
    base.file(path, typeof content === "string" ? content : "");
  }
}

/**
 * Export both JS and Python workspace slices into one zip.
 * @param {{ js: { files: Record<string, string> }, python: { files: Record<string, string> } }} dualSlice
 */
export async function downloadDualWorkspaceZip(dualSlice) {
  const zip = new JSZip();
  addFilesToZip(zip, dualSlice.js?.files ?? {}, "javascript");
  addFilesToZip(zip, dualSlice.python?.files ?? {}, "python");
  zip.file(
    "README.txt",
    [
      "LLM Workspace export",
      `Exported: ${new Date().toISOString()}`,
      "",
      "javascript/ — JavaScript workspace (*.js)",
      "python/ — Python workspace (*.py)",
    ].join("\n"),
  );

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `llm-workspace-${stampForFilename()}.zip`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
