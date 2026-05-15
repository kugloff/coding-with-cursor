/**
 * Registry of workspace languages. Add entries here to support more environments.
 * @typedef {import('./workspaceEnvironments.types.js').WorkspaceEnvironmentId} WorkspaceEnvironmentId
 * @typedef {import('./workspaceEnvironments.types.js').WorkspaceEnvironmentMeta} WorkspaceEnvironmentMeta
 */

/** @type {Record<WorkspaceEnvironmentId, WorkspaceEnvironmentMeta>} */
export const WORKSPACE_ENVIRONMENTS = {
  js: {
    id: "js",
    ext: ".js",
    lang: "JavaScript",
    monaco: "javascript",
    exportFolder: "javascript",
    gistLang: "javascript",
    runSupported: true,
    formatSupported: true,
  },
  python: {
    id: "python",
    ext: ".py",
    lang: "Python",
    monaco: "python",
    exportFolder: "python",
    gistLang: "python",
    runSupported: true,
    formatSupported: true,
  },
  csharp: {
    id: "csharp",
    ext: ".cs",
    lang: "C#",
    monaco: "csharp",
    exportFolder: "csharp",
    gistLang: "csharp",
    runSupported: false,
    formatSupported: true,
  },
};

/** @type {WorkspaceEnvironmentId[]} */
export const WORKSPACE_ENVIRONMENT_IDS = Object.keys(WORKSPACE_ENVIRONMENTS);

const CONVERTED_SUFFIX = "_converted";

/**
 * @param {unknown} raw
 * @returns {WorkspaceEnvironmentId}
 */
export function normalizeWorkspaceEnvironment(raw) {
  if (typeof raw !== "string") return "js";
  const t = raw.trim().toLowerCase();
  return t in WORKSPACE_ENVIRONMENTS ? /** @type {WorkspaceEnvironmentId} */ (t) : "js";
}

/**
 * @param {unknown} id
 * @returns {id is WorkspaceEnvironmentId}
 */
export function isWorkspaceEnvironmentId(id) {
  return typeof id === "string" && id in WORKSPACE_ENVIRONMENTS;
}

/**
 * @param {WorkspaceEnvironmentId} sourceEnvId
 * @returns {WorkspaceEnvironmentMeta[]}
 */
export function getTranslationTargets(sourceEnvId) {
  if (!isWorkspaceEnvironmentId(sourceEnvId)) return [];
  return WORKSPACE_ENVIRONMENT_IDS.filter((id) => id !== sourceEnvId).map((id) => WORKSPACE_ENVIRONMENTS[id]);
}

/**
 * @param {WorkspaceEnvironmentId} sourceEnvId
 * @returns {WorkspaceEnvironmentId[]}
 */
export function getTranslationTargetIds(sourceEnvId) {
  return getTranslationTargets(sourceEnvId).map((m) => m.id);
}

/**
 * @param {WorkspaceEnvironmentId} sourceEnvId
 * @param {unknown} rawTarget
 * @returns {{ ok: true, targetEnvironment: WorkspaceEnvironmentId } | { ok: false, detail: string }}
 */
export function resolveTranslationTarget(sourceEnvId, rawTarget) {
  const allowed = getTranslationTargetIds(sourceEnvId);
  if (allowed.length === 0) {
    return { ok: false, detail: "No translation targets configured for this workspace." };
  }

  if (rawTarget === undefined || rawTarget === null || (typeof rawTarget === "string" && !rawTarget.trim())) {
    if (allowed.length === 1) {
      return { ok: true, targetEnvironment: allowed[0] };
    }
    return {
      ok: false,
      detail: `Multiple translation targets (${allowed.join(", ")}). Send "targetEnvironment".`,
    };
  }

  const target = normalizeWorkspaceEnvironment(rawTarget);
  if (target === sourceEnvId) {
    return { ok: false, detail: '"targetEnvironment" must differ from "environment" (source workspace).' };
  }
  if (!allowed.includes(target)) {
    return {
      ok: false,
      detail: `Invalid targetEnvironment "${String(rawTarget)}". Allowed from ${sourceEnvId}: ${allowed.join(", ")}.`,
    };
  }
  return { ok: true, targetEnvironment: target };
}

/**
 * @param {string} sourcePath
 * @param {WorkspaceEnvironmentId} sourceEnvId
 * @param {WorkspaceEnvironmentId} targetEnvId
 * @param {Record<string, string>} targetFiles
 * @returns {string}
 */
export function buildConvertedFilename(sourcePath, sourceEnvId, targetEnvId, targetFiles) {
  const source = WORKSPACE_ENVIRONMENTS[sourceEnvId];
  const target = WORKSPACE_ENVIRONMENTS[targetEnvId];
  if (!source || !target || sourceEnvId === targetEnvId) {
    return `untitled${CONVERTED_SUFFIX}${target?.ext ?? ".txt"}`;
  }

  let base = typeof sourcePath === "string" ? sourcePath.trim() : "";
  if (base.endsWith(source.ext)) {
    base = base.slice(0, -source.ext.length);
  }
  if (!base) base = "untitled";

  let name = `${base}${CONVERTED_SUFFIX}${target.ext}`;
  let n = 2;
  while (name in targetFiles) {
    name = `${base}${CONVERTED_SUFFIX}-${n}${target.ext}`;
    n += 1;
  }
  return name;
}
