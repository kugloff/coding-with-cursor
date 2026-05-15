import JSZip from "jszip";
import { WORKSPACE_ENVIRONMENT_IDS, WORKSPACE_ENVIRONMENTS } from "@shared/workspaceEnvironments.js";

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
 * Export all workspace slices into one zip.
 * @param {Record<string, { files: Record<string, string> }>} slicesByEnv
 */
export async function downloadDualWorkspaceZip(slicesByEnv) {
  const zip = new JSZip();
  const readmeLines = ["LLM Workspace export", `Exported: ${new Date().toISOString()}`, ""];

  for (const id of WORKSPACE_ENVIRONMENT_IDS) {
    const meta = WORKSPACE_ENVIRONMENTS[id];
    const slice = slicesByEnv[id];
    addFilesToZip(zip, slice?.files ?? {}, meta.exportFolder);
    readmeLines.push(`${meta.exportFolder}/ — ${meta.lang} workspace (*${meta.ext})`);
  }

  zip.file("README.txt", readmeLines.join("\n"));

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
