import { isValidJsWorkspaceFilename, isValidPyWorkspaceFilename } from "./workspaceFilename.js";

/** Legacy single-workspace key (v1); migrated into the JS slice on first load. */
export const WORKSPACE_LOCAL_STORAGE_KEY = "llm:workspace:v1";

/** Dual-environment workspace persistence. */
export const DUAL_WORKSPACE_STORAGE_KEY = "llm:dualWorkspace:v1";

const DEFAULT_JS_FILES = {
  "main.js": `// Welcome — edit freely
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Monaco"));
`,
};

const DEFAULT_PY_FILES = {
  "main.py": `# Welcome — edit freely
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("Monaco"))
`,
};

/**
 * @returns {{ environment: "js" | "python", js: { files: Record<string, string>, activePath: string | null }, python: { files: Record<string, string>, activePath: string | null } }}
 */
export function getDefaultDualWorkspace() {
  return {
    environment: "js",
    js: { files: { ...DEFAULT_JS_FILES }, activePath: "main.js" },
    python: { files: { ...DEFAULT_PY_FILES }, activePath: "main.py" },
  };
}

/**
 * @param {unknown} slice
 * @param {"js" | "python"} kind
 * @returns {{ files: Record<string, string>, activePath: string | null } | null}
 */
function normalizeWorkspaceSlice(slice, kind) {
  if (!slice || typeof slice !== "object" || Array.isArray(slice)) return null;
  const filesIn = slice.files;
  if (typeof filesIn !== "object" || filesIn === null || Array.isArray(filesIn)) return null;
  const isValid = kind === "python" ? isValidPyWorkspaceFilename : isValidJsWorkspaceFilename;
  const files = {};
  for (const [k, v] of Object.entries(filesIn)) {
    if (!isValid(k)) continue;
    if (typeof v !== "string") continue;
    files[k] = v;
  }
  const keys = Object.keys(files).sort((a, b) => a.localeCompare(b));
  if (keys.length === 0) return null;
  let ap =
    typeof slice.activePath === "string" && slice.activePath.trim()
      ? slice.activePath.trim()
      : null;
  if (!ap || !(ap in files)) ap = keys[0];
  return { files, activePath: ap };
}

/**
 * @returns {ReturnType<typeof getDefaultDualWorkspace> | null}
 */
export function loadPersistedDualWorkspace() {
  if (typeof localStorage === "undefined") return null;
  try {
    const rawDual = localStorage.getItem(DUAL_WORKSPACE_STORAGE_KEY);
    if (rawDual != null && rawDual !== "") {
      const data = JSON.parse(rawDual);
      if (!data || typeof data !== "object" || Array.isArray(data)) return null;
      const envRaw = data.environment;
      const environment =
        typeof envRaw === "string" && envRaw.trim().toLowerCase() === "python" ? "python" : "js";
      const js = normalizeWorkspaceSlice(data.js, "js");
      const py = normalizeWorkspaceSlice(data.python, "python");
      if (!js || !py) return null;
      return { environment, js, python: py };
    }

    const rawLegacy = localStorage.getItem(WORKSPACE_LOCAL_STORAGE_KEY);
    if (rawLegacy != null && rawLegacy !== "") {
      const data = JSON.parse(rawLegacy);
      if (!data || typeof data !== "object" || Array.isArray(data)) return null;
      const filesIn = data.files;
      if (typeof filesIn !== "object" || filesIn === null || Array.isArray(filesIn)) return null;
      const files = {};
      for (const [k, v] of Object.entries(filesIn)) {
        if (!isValidJsWorkspaceFilename(k)) continue;
        if (typeof v !== "string") continue;
        files[k] = v;
      }
      const keys = Object.keys(files).sort((a, b) => a.localeCompare(b));
      if (keys.length === 0) return null;
      let ap =
        typeof data.activePath === "string" && data.activePath.trim()
          ? data.activePath.trim()
          : null;
      if (!ap || !(ap in files)) ap = keys[0];
      const def = getDefaultDualWorkspace();
      return {
        environment: "js",
        js: { files, activePath: ap },
        python: def.python,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {ReturnType<typeof getDefaultDualWorkspace>} dual
 */
export function persistDualWorkspace(dual) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      DUAL_WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        environment: dual.environment,
        js: dual.js,
        python: dual.python,
      }),
    );
  } catch {
    // Quota, private mode, or disabled storage
  }
}

export function clearPersistedWorkspace() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(DUAL_WORKSPACE_STORAGE_KEY);
    localStorage.removeItem(WORKSPACE_LOCAL_STORAGE_KEY);
  } catch {
    // ignore
  }
}
