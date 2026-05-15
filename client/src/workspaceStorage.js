import {
  WORKSPACE_ENVIRONMENT_IDS,
  WORKSPACE_ENVIRONMENTS,
  normalizeWorkspaceEnvironment,
} from "@shared/workspaceEnvironments.js";
import { isValidWorkspaceFilename } from "@shared/workspaceFilename.js";
import { isValidJsWorkspaceFilename } from "./workspaceFilename.js";

/** Legacy single-workspace key (v1); migrated into the JS slice on first load. */
export const WORKSPACE_LOCAL_STORAGE_KEY = "llm:workspace:v1";

/** Multi-environment workspace persistence (JS, Python, C#, …). */
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

const DEFAULT_CS_FILES = {
  "main.cs": `// Welcome — edit freely
using System;

class Program
{
    static string Greet(string name) => $"Hello, {name}!";

    static void Main()
    {
        Console.WriteLine(Greet("Monaco"));
    }
}
`,
};

const DEFAULT_FILES_BY_ENV = {
  js: DEFAULT_JS_FILES,
  python: DEFAULT_PY_FILES,
  csharp: DEFAULT_CS_FILES,
};

/**
 * @param {import("@shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId} kind
 */
function defaultSliceForEnv(kind) {
  const files = { ...(DEFAULT_FILES_BY_ENV[kind] ?? { [`untitled${WORKSPACE_ENVIRONMENTS[kind]?.ext ?? ".txt"}`]: "" }) };
  const keys = Object.keys(files).sort((a, b) => a.localeCompare(b));
  return { files, activePath: keys[0] ?? null };
}

/**
 * @returns {{ environment: import("@shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId, js: { files: Record<string, string>, activePath: string | null }, python: { files: Record<string, string>, activePath: string | null }, csharp: { files: Record<string, string>, activePath: string | null } }}
 */
export function getDefaultDualWorkspace() {
  /** @type {Record<string, { files: Record<string, string>, activePath: string | null }>} */
  const slices = {};
  for (const id of WORKSPACE_ENVIRONMENT_IDS) {
    slices[id] = defaultSliceForEnv(id);
  }
  return {
    environment: "js",
    ...slices,
  };
}

/**
 * @param {unknown} slice
 * @param {import("@shared/workspaceEnvironments.types.js").WorkspaceEnvironmentId} kind
 */
function normalizeWorkspaceSlice(slice, kind) {
  if (!slice || typeof slice !== "object" || Array.isArray(slice)) return null;
  const filesIn = slice.files;
  if (typeof filesIn !== "object" || filesIn === null || Array.isArray(filesIn)) return null;
  const files = {};
  for (const [k, v] of Object.entries(filesIn)) {
    if (!isValidWorkspaceFilename(k, kind)) continue;
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
 * @param {Record<string, unknown>} data
 */
function hydrateWorkspaceFromStorage(data) {
  const environment = normalizeWorkspaceEnvironment(data.environment);
  /** @type {Record<string, { files: Record<string, string>, activePath: string | null }>} */
  const slices = {};
  let anyMissing = false;

  for (const id of WORKSPACE_ENVIRONMENT_IDS) {
    const normalized = normalizeWorkspaceSlice(data[id], id);
    if (normalized) {
      slices[id] = normalized;
    } else {
      anyMissing = true;
      slices[id] = defaultSliceForEnv(id);
    }
  }

  return { environment, slices, migrated: anyMissing };
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
      const { environment, slices } = hydrateWorkspaceFromStorage(data);
      return { environment, ...slices };
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
        csharp: def.csharp,
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
    /** @type {Record<string, unknown>} */
    const payload = { environment: dual.environment };
    for (const id of WORKSPACE_ENVIRONMENT_IDS) {
      payload[id] = dual[id];
    }
    localStorage.setItem(DUAL_WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
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
