import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Copy,
  LayoutPanelLeft,
  MessageSquare,
  PanelsTopLeft,
  Play,
  Redo2,
  RotateCcw,
  Sparkles,
  Undo2,
  Wand2,
} from "lucide-react";
import { copyTextToClipboard } from "./copyToClipboard.js";
import { formatJavaScript } from "./formatJavaScript.js";
import { downloadDualWorkspaceZip } from "./exportWorkspaceZip.js";
import { formatGistSnippet } from "./workspaceSnippet.js";
import { applyTheme, loadTheme, persistTheme } from "./theme.js";
import "./App.css";
import FileExplorer from "./components/FileExplorer.jsx";
import CodeEditor from "./components/CodeEditor.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import AiEditPreviewModal from "./components/AiEditPreviewModal.jsx";
import {
  WORKSPACE_ENVIRONMENT_IDS,
  WORKSPACE_ENVIRONMENTS,
  normalizeWorkspaceEnvironment,
} from "@shared/workspaceEnvironments.js";
import { isValidWorkspaceFilename } from "@shared/workspaceFilename.js";
import {
  validateWorkspaceAiFileTarget,
  validateWorkspaceCreate,
  validateWorkspaceExistingPath,
  validateWorkspaceRenameTarget,
} from "./workspaceFileValidation.js";
import {
  clearPersistedWorkspace,
  getDefaultDualWorkspace,
  loadPersistedDualWorkspace,
  persistDualWorkspace,
} from "./workspaceStorage.js";

const MAX_UNDO = 40;

function createEnvStacks() {
  return Object.fromEntries(WORKSPACE_ENVIRONMENT_IDS.map((id) => [id, []]));
}

function editorLanguageForWorkspacePath(filename, envId = "js") {
  if (!filename) return WORKSPACE_ENVIRONMENTS[envId]?.monaco ?? "plaintext";
  if (isValidWorkspaceFilename(filename, envId)) return WORKSPACE_ENVIRONMENTS[envId]?.monaco ?? "plaintext";
  return "plaintext";
}

function nextUntitledName(files, environment) {
  const ext = WORKSPACE_ENVIRONMENTS[environment]?.ext ?? ".txt";
  let n = 1;
  let name = `untitled-${n}${ext}`;
  while (name in files) {
    n += 1;
    name = `untitled-${n}${ext}`;
  }
  const v = validateWorkspaceCreate(name, files, environment);
  if (v.ok) return name;
  return `untitled-${Date.now()}${ext}`;
}

/** Shallow snapshot: new `files` object, same string values. */
function cloneWorkspace(w) {
  return { files: { ...w.files }, activePath: w.activePath };
}

export default function App() {
  const [dualWorkspace, setDualWorkspace] = useState(() => {
    const loaded = loadPersistedDualWorkspace();
    if (loaded) return loaded;
    return getDefaultDualWorkspace();
  });
  const [editorNonce, setEditorNonce] = useState(0);
  const [aiEditPreview, setAiEditPreview] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [exportZipPending, setExportZipPending] = useState(false);
  const [runOutput, setRunOutput] = useState("");
  const [runError, setRunError] = useState("");
  const [runErrorLabel, setRunErrorLabel] = useState(null);
  const [runMeta, setRunMeta] = useState(null);
  const [runPending, setRunPending] = useState(false);
  const [formatPending, setFormatPending] = useState(false);
  const [runOutputMinimized, setRunOutputMinimized] = useState(false);
  const [colorTheme, setColorTheme] = useState(() => loadTheme());
  const toastTimerRef = useRef(null);
  const undoByEnv = useRef(createEnvStacks());
  const redoByEnv = useRef(createEnvStacks());
  const [historyTick, setHistoryTick] = useState(0);
  const manualEditGroupRef = useRef({ path: null, captured: false });

  const dualWorkspaceRef = useRef(dualWorkspace);
  useEffect(() => {
    dualWorkspaceRef.current = dualWorkspace;
  }, [dualWorkspace]);

  const workspaceRef = useRef({ files: {}, activePath: null });
  const environment = dualWorkspace.environment;
  const activeSlice = dualWorkspace[environment];
  const { files, activePath } = activeSlice;

  useEffect(() => {
    workspaceRef.current = activeSlice;
  }, [activeSlice]);

  useEffect(() => {
    persistDualWorkspace(dualWorkspace);
  }, [dualWorkspace]);

  useEffect(() => {
    applyTheme(colorTheme);
    persistTheme(colorTheme);
  }, [colorTheme]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const bumpHistoryUi = useCallback(() => {
    setHistoryTick((t) => t + 1);
  }, []);

  const pushUndoSnapshot = useCallback(
    (snapshot) => {
      const e = dualWorkspaceRef.current.environment;
      redoByEnv.current[e] = [];
      const stack = undoByEnv.current[e];
      const next = [...stack, snapshot];
      undoByEnv.current[e] = next.length > MAX_UNDO ? next.slice(-MAX_UNDO) : next;
      bumpHistoryUi();
    },
    [bumpHistoryUi],
  );

  const resetManualEditGroup = useCallback(() => {
    manualEditGroupRef.current = { path: null, captured: false };
  }, []);

  const handleUndo = useCallback(() => {
    const e = dualWorkspaceRef.current.environment;
    const stack = undoByEnv.current[e];
    if (stack.length === 0) return;
    const current = cloneWorkspace(dualWorkspaceRef.current[e]);
    const previous = stack[stack.length - 1];
    undoByEnv.current[e] = stack.slice(0, -1);
    const rstack = redoByEnv.current[e];
    const rnext = [...rstack, current];
    redoByEnv.current[e] = rnext.length > MAX_UNDO ? rnext.slice(-MAX_UNDO) : rnext;
    bumpHistoryUi();
    resetManualEditGroup();
    setDualWorkspace((dw) => ({ ...dw, [e]: previous }));
    setEditorNonce((n) => n + 1);
  }, [bumpHistoryUi, resetManualEditGroup]);

  const handleRedo = useCallback(() => {
    const e = dualWorkspaceRef.current.environment;
    const stack = redoByEnv.current[e];
    if (stack.length === 0) return;
    const current = cloneWorkspace(dualWorkspaceRef.current[e]);
    const nextState = stack[stack.length - 1];
    redoByEnv.current[e] = stack.slice(0, -1);
    const ustack = undoByEnv.current[e];
    const unext = [...ustack, current];
    undoByEnv.current[e] = unext.length > MAX_UNDO ? unext.slice(-MAX_UNDO) : unext;
    bumpHistoryUi();
    resetManualEditGroup();
    setDualWorkspace((dw) => ({ ...dw, [e]: nextState }));
    setEditorNonce((n) => n + 1);
  }, [bumpHistoryUi, resetManualEditGroup]);

  const handleResetWorkspace = useCallback(() => {
    if (
      !window.confirm(
        "Reset all workspaces (JavaScript, Python, C#) to defaults? This removes the saved copy in this browser and clears undo/redo for every environment.",
      )
    ) {
      return;
    }
    clearPersistedWorkspace();
    undoByEnv.current = createEnvStacks();
    redoByEnv.current = createEnvStacks();
    bumpHistoryUi();
    resetManualEditGroup();
    setDualWorkspace(getDefaultDualWorkspace());
    setEditorNonce((n) => n + 1);
    setAiEditPreview(null);
    setRunOutput("");
    setRunError("");
    setRunErrorLabel(null);
    setRunMeta(null);
    setRunOutputMinimized(false);
  }, [bumpHistoryUi, resetManualEditGroup]);

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(typeof message === "string" && message.trim() ? message.trim() : "Done.");
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  const sortedPaths = useMemo(() => Object.keys(files).sort((a, b) => a.localeCompare(b)), [files]);

  const editorValue = activePath ? files[activePath] ?? "" : "";
  const envMeta = WORKSPACE_ENVIRONMENTS[environment] ?? WORKSPACE_ENVIRONMENTS.js;
  const editorLanguage =
    activePath && isValidWorkspaceFilename(activePath, environment)
      ? envMeta.monaco
      : "plaintext";

  const canUseActiveFile = Boolean(activePath && isValidWorkspaceFilename(activePath, environment));
  const canRunCode = canUseActiveFile && envMeta.runSupported;
  const canFormatCode = canUseActiveFile && envMeta.formatSupported;

  useEffect(() => {
    setRunOutput("");
    setRunError("");
    setRunErrorLabel(null);
    setRunMeta(null);
  }, [activePath, environment]);

  const handleRunCode = useCallback(async () => {
    const env = dualWorkspaceRef.current.environment;
    const slice = dualWorkspaceRef.current[env];
    const ap = slice.activePath;
    if (!ap) return;
    const meta = WORKSPACE_ENVIRONMENTS[env];
    if (!meta?.runSupported || !isValidWorkspaceFilename(ap, env)) return;
    const code = typeof slice.files[ap] === "string" ? slice.files[ap] : "";
    setRunPending(true);
    setRunOutputMinimized(false);
    setRunError("");
    setRunErrorLabel(null);
    setRunOutput("");
    setRunMeta(null);
    try {
      const res = await fetch("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, environment: env }),
      });
      let data = {};
      const raw = await res.text();
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          setRunError(raw.slice(0, 400) || `HTTP ${res.status}`);
          setRunErrorLabel("Error");
          setRunMeta(null);
          return;
        }
      }
      const out = typeof data.output === "string" ? data.output : "";
      const err = typeof data.error === "string" ? data.error : "";
      const durationMs = typeof data.durationMs === "number" ? data.durationMs : null;
      const timeoutMs = typeof data.timeoutMs === "number" ? data.timeoutMs : null;
      const runStatus =
        data.runStatus === "timeout" || data.runStatus === "error" || data.runStatus === "ok"
          ? data.runStatus
          : err.trim()
            ? "error"
            : "ok";
      const errorLabel =
        typeof data.errorLabel === "string" && data.errorLabel.trim() ? data.errorLabel.trim() : null;

      setRunOutput(out);
      setRunError(err);
      setRunErrorLabel(errorLabel);
      setRunMeta(
        durationMs !== null
          ? { durationMs, timeoutMs, runStatus }
          : err.trim()
            ? { durationMs: 0, timeoutMs: null, runStatus: "error" }
            : null,
      );
      if (!res.ok && !err) {
        setRunError(typeof data.detail === "string" ? data.detail : `HTTP ${res.status}`);
        setRunErrorLabel("Error");
        setRunMeta({ durationMs: 0, timeoutMs: null, runStatus: "error" });
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Could not reach server");
      setRunErrorLabel("Error");
      setRunMeta(null);
    } finally {
      setRunPending(false);
    }
  }, []);

  const handleFormatDocument = useCallback(async () => {
    const env = dualWorkspaceRef.current.environment;
    const w = dualWorkspaceRef.current[env];
    const ap = w.activePath;
    if (!ap) return;
    const meta = WORKSPACE_ENVIRONMENTS[env];
    if (!meta?.formatSupported || !isValidWorkspaceFilename(ap, env)) {
      showToast(`Format is not available for ${meta?.lang ?? env} yet`);
      return;
    }

    const code = typeof w.files[ap] === "string" ? w.files[ap] : "";
    setFormatPending(true);

    try {
      let formatted;
      if (env === "js") {
        formatted = await formatJavaScript(code);
      } else {
        const res = await fetch("/format", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, environment: env }),
        });

        let data = {};
        const raw = await res.text();
        if (raw) {
          try {
            data = JSON.parse(raw);
          } catch {
            throw new Error(raw.slice(0, 200) || `HTTP ${res.status}`);
          }
        }

        if (!res.ok) {
          const detail = typeof data.detail === "string" ? data.detail : null;
          const errLabel = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
          throw new Error(detail || errLabel);
        }

        const fmtErr = typeof data.error === "string" ? data.error.trim() : "";
        if (fmtErr) throw new Error(fmtErr);
        if (typeof data.code !== "string") {
          throw new Error("Invalid format response from server");
        }
        formatted = data.code;
      }

      if (typeof formatted !== "string") {
        throw new Error("Formatter did not return a string");
      }

      pushUndoSnapshot(cloneWorkspace(w));
      resetManualEditGroup();
      setDualWorkspace((dw) => ({
        ...dw,
        [env]: {
          ...dw[env],
          files: { ...dw[env].files, [ap]: formatted },
        },
      }));
      const formatTool =
        env === "js" ? "Prettier" : env === "csharp" ? "CSharpier" : "Black";
      showToast(`Formatted with ${formatTool}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Format failed";
      showToast(msg);
    } finally {
      setFormatPending(false);
    }
  }, [pushUndoSnapshot, resetManualEditGroup, showToast]);

  const handleEditorChange = useCallback(
    (value) => {
      const next = value ?? "";
      const e = dualWorkspaceRef.current.environment;
      const w = dualWorkspaceRef.current[e];
      if (!w.activePath) return;
      const path = w.activePath;
      const g = manualEditGroupRef.current;
      if (g.path !== path || !g.captured) {
        pushUndoSnapshot(cloneWorkspace(w));
        manualEditGroupRef.current = { path, captured: true };
      }
      setDualWorkspace((dw) => ({
        ...dw,
        [e]: {
          ...dw[e],
          files: { ...dw[e].files, [path]: next },
        },
      }));
    },
    [pushUndoSnapshot],
  );

  const handleSelectFile = useCallback((path) => {
    resetManualEditGroup();
    setDualWorkspace((dw) => {
      const e = dw.environment;
      const w = dw[e];
      if (!(path in w.files)) return dw;
      return { ...dw, [e]: { ...w, activePath: path } };
    });
  }, [resetManualEditGroup]);

  const handleCreateFile = useCallback(() => {
    const e = dualWorkspaceRef.current.environment;
    pushUndoSnapshot(cloneWorkspace(dualWorkspaceRef.current[e]));
    resetManualEditGroup();
    setDualWorkspace((dw) => {
      const cur = dw[dw.environment];
      const name = nextUntitledName(cur.files, dw.environment);
      return {
        ...dw,
        [dw.environment]: {
          files: { ...cur.files, [name]: "" },
          activePath: name,
        },
      };
    });
  }, [pushUndoSnapshot, resetManualEditGroup]);

  const handleDeleteFile = useCallback(
    (path) => {
      const e = dualWorkspaceRef.current.environment;
      const w = dualWorkspaceRef.current[e];
      if (Object.keys(w.files).length <= 1) {
        window.alert("Cannot delete the last file in this workspace.");
        return;
      }
      const del = validateWorkspaceExistingPath(path, w.files, e);
      if (!del.ok) return;
      if (!window.confirm(`Delete "${del.filename}"?`)) return;
      pushUndoSnapshot(cloneWorkspace(w));
      resetManualEditGroup();
      setDualWorkspace((dw) => {
        const cur = dw[e];
        if (!(del.filename in cur.files)) return dw;
        const { [del.filename]: removed, ...rest } = cur.files;
        void removed;
        const keys = Object.keys(rest).sort((a, b) => a.localeCompare(b));
        const nextActive = cur.activePath === del.filename ? keys[0] ?? null : cur.activePath;
        return { ...dw, [e]: { files: rest, activePath: nextActive } };
      });
      setEditorNonce((n) => n + 1);
    },
    [pushUndoSnapshot, resetManualEditGroup],
  );

  const handleRenameFile = useCallback(
    (oldPath, newPath) => {
      const e = dualWorkspaceRef.current.environment;
      const w = dualWorkspaceRef.current[e];
      const v = validateWorkspaceRenameTarget(oldPath, newPath, w.files, e);
      if (!v.ok) return false;
      const next = v.filename;
      if (next === oldPath) return true;
      pushUndoSnapshot(cloneWorkspace(w));
      resetManualEditGroup();
      const content = w.files[oldPath];
      const { [oldPath]: _, ...rest } = w.files;
      setDualWorkspace((dw) => ({
        ...dw,
        [e]: {
          files: { ...rest, [next]: content },
          activePath: w.activePath === oldPath ? next : w.activePath,
        },
      }));
      return true;
    },
    [pushUndoSnapshot, resetManualEditGroup],
  );

  const applyAiFileEdit = useCallback(
    (tool, options = {}) => {
      if (!tool || (tool.action !== "edit_file" && tool.action !== "create_file")) return;
      const e = options.targetEnvironment ?? dualWorkspaceRef.current.environment;
      const w = dualWorkspaceRef.current[e];
      const filenameRaw = typeof tool.filename === "string" ? tool.filename : "";
      const v = validateWorkspaceAiFileTarget(filenameRaw, w.files, tool.action, e);
      if (!v.ok) return;
      const filename = v.filename;
      if (typeof tool.content !== "string") return;
      pushUndoSnapshot(cloneWorkspace(w));
      resetManualEditGroup();
      const switchToTarget = Boolean(options.switchToTarget);
      setDualWorkspace((dw) => ({
        ...dw,
        ...(switchToTarget ? { environment: e } : {}),
        [e]: {
          ...dw[e],
          files: { ...dw[e].files, [filename]: tool.content },
          activePath: filename,
        },
      }));
      setEditorNonce((n) => n + 1);
      const envLabel = WORKSPACE_ENVIRONMENTS[e]?.lang ?? e;
      const toastMsg =
        tool.action === "create_file"
          ? `File created in ${envLabel}: ${filename}`
          : `File updated in ${envLabel}: ${filename}`;
      showToast(toastMsg);
    },
    [pushUndoSnapshot, resetManualEditGroup, showToast],
  );

  const handleAiEditProposal = useCallback((tool, options = {}) => {
    if (!tool || (tool.action !== "edit_file" && tool.action !== "create_file")) return;
    const e = options.targetEnvironment ?? dualWorkspaceRef.current.environment;
    const w = dualWorkspaceRef.current[e];
    const filenameRaw = typeof tool.filename === "string" ? tool.filename : "";
    const v = validateWorkspaceAiFileTarget(filenameRaw, w.files, tool.action, e);
    if (!v.ok) return;
    const filename = v.filename;
    if (typeof tool.content !== "string") return;
    const original = filename in w.files ? w.files[filename] ?? "" : "";
    setAiEditPreview({
      filename,
      original,
      modified: tool.content,
      action: tool.action,
      targetEnvironment: e,
      switchToTarget: Boolean(options.switchToTarget),
      workspaceLabel: WORKSPACE_ENVIRONMENTS[e]?.lang ?? e,
    });
  }, []);

  const handleAcceptAiEditPreview = useCallback(() => {
    if (!aiEditPreview) return;
    applyAiFileEdit(
      {
        action: aiEditPreview.action,
        filename: aiEditPreview.filename,
        content: aiEditPreview.modified,
      },
      {
        targetEnvironment: aiEditPreview.targetEnvironment,
        switchToTarget: aiEditPreview.switchToTarget,
      },
    );
    setAiEditPreview(null);
  }, [aiEditPreview, applyAiFileEdit]);

  const handleRejectAiEditPreview = useCallback(() => {
    setAiEditPreview(null);
  }, []);

  const aiPreviewLanguage = useMemo(() => {
    if (!aiEditPreview) return "plaintext";
    const previewEnv = aiEditPreview.targetEnvironment ?? environment;
    return editorLanguageForWorkspacePath(aiEditPreview.filename, previewEnv);
  }, [aiEditPreview, environment]);

  const handleCopyRawFile = useCallback(
    async (path) => {
      const p = path ?? activePath;
      if (!p || typeof files[p] !== "string") {
        showToast("No file to copy");
        return;
      }
      const ok = await copyTextToClipboard(files[p]);
      showToast(ok ? `Copied code: ${p}` : "Could not copy to clipboard");
    },
    [activePath, files, showToast],
  );

  const handleCopySnippet = useCallback(
    async (path) => {
      const p = path ?? activePath;
      if (!p || typeof files[p] !== "string") {
        showToast("No file to copy");
        return;
      }
      const text = formatGistSnippet(p, files[p]);
      const ok = await copyTextToClipboard(text);
      showToast(ok ? `Copied snippet: ${p}` : "Could not copy to clipboard");
    },
    [activePath, files, showToast],
  );

  const handleExportZip = useCallback(async () => {
    if (exportZipPending) return;
    setExportZipPending(true);
    try {
      const slices = Object.fromEntries(
        WORKSPACE_ENVIRONMENT_IDS.map((id) => [id, dualWorkspaceRef.current[id]]),
      );
      await downloadDualWorkspaceZip(slices);
      showToast("Workspace ZIP downloaded");
    } catch {
      showToast("ZIP export failed");
    } finally {
      setExportZipPending(false);
    }
  }, [exportZipPending, showToast]);

  const setColorThemeChoice = useCallback((next) => {
    setColorTheme(next === "light" ? "light" : "dark");
  }, []);

  const setEnvironment = useCallback((next) => {
    const n = normalizeWorkspaceEnvironment(next);
    setDualWorkspace((dw) => {
      if (dw.environment === n) return dw;
      return { ...dw, environment: n };
    });
    resetManualEditGroup();
    setRunOutput("");
    setRunError("");
  }, [resetManualEditGroup]);

  const canUndo = useMemo(() => undoByEnv.current[dualWorkspace.environment].length > 0, [historyTick, dualWorkspace.environment]);
  const canRedo = useMemo(() => redoByEnv.current[dualWorkspace.environment].length > 0, [historyTick, dualWorkspace.environment]);

  return (
    <div className="workspace">
      <header className="workspace__topbar">
        <div className="workspace__brand">
          <span className="workspace__brand-icon" aria-hidden>
            <PanelsTopLeft size={18} strokeWidth={1.75} />
          </span>
          <span className="workspace__title">Workspace</span>
        </div>
        <div className="workspace__topbar-right">
          <div className="workspace__theme-toggle" role="group" aria-label="Color theme">
            <button
              type="button"
              className={`workspace__theme-btn${colorTheme === "dark" ? " workspace__theme-btn--active" : ""}`}
              onClick={() => setColorThemeChoice("dark")}
              aria-pressed={colorTheme === "dark"}
            >
              Dark
            </button>
            <button
              type="button"
              className={`workspace__theme-btn${colorTheme === "light" ? " workspace__theme-btn--active" : ""}`}
              onClick={() => setColorThemeChoice("light")}
              aria-pressed={colorTheme === "light"}
            >
              Light
            </button>
          </div>
          <div className="workspace__env-toggle workspace__env-toggle--multi" role="group" aria-label="Workspace environment">
            {WORKSPACE_ENVIRONMENT_IDS.map((envId) => {
              const meta = WORKSPACE_ENVIRONMENTS[envId];
              return (
                <button
                  key={envId}
                  type="button"
                  className={`workspace__env-btn${environment === envId ? " workspace__env-btn--active" : ""}`}
                  onClick={() => setEnvironment(envId)}
                  disabled={runPending}
                  aria-pressed={environment === envId}
                >
                  {meta.lang}
                </button>
              );
            })}
          </div>
          <div className="workspace__share-btns" role="group" aria-label="Export and share">
            <button
              type="button"
              className="workspace__share-btn"
              onClick={handleExportZip}
              disabled={exportZipPending}
              title="Download all workspace folders (JavaScript, Python, C#) as a ZIP"
            >
              <Archive size={14} strokeWidth={2} aria-hidden />
              {exportZipPending ? "Exporting…" : "Export ZIP"}
            </button>
          </div>
          <div className="workspace__history-btns" role="group" aria-label="Workspace history">
            <button
              type="button"
              className="workspace__history-btn"
              onClick={handleUndo}
              disabled={!canUndo}
              title={canUndo ? "Restore previous workspace snapshot" : "Nothing to undo"}
            >
              <Undo2 size={14} strokeWidth={2} aria-hidden />
              Undo
            </button>
            <button
              type="button"
              className="workspace__history-btn"
              onClick={handleRedo}
              disabled={!canRedo}
              title={canRedo ? "Re-apply the next workspace snapshot" : "Nothing to redo"}
            >
              <Redo2 size={14} strokeWidth={2} aria-hidden />
              Redo
            </button>
            <button
              type="button"
              className="workspace__history-btn workspace__history-btn--reset"
              onClick={handleResetWorkspace}
              title="Clear browser save and restore default workspaces (undo history cleared)"
            >
              <RotateCcw size={14} strokeWidth={2} aria-hidden />
              Reset
            </button>
          </div>
          <span className="workspace__meta">
            <Sparkles size={12} strokeWidth={2} className="workspace__meta-glow" aria-hidden />
            Vite · React · Monaco
          </span>
        </div>
      </header>

      <div className="workspace__body">
        <aside className="workspace__pane workspace__pane--left">
          <div className="pane-header">
            <h2 className="pane-header__title">
              <LayoutPanelLeft size={12} strokeWidth={2} aria-hidden />
              Explorer
            </h2>
          </div>
          <FileExplorer
            environment={environment}
            paths={sortedPaths}
            activePath={activePath}
            onSelect={handleSelectFile}
            onCreate={handleCreateFile}
            onDeleteFile={handleDeleteFile}
            onRenameFile={handleRenameFile}
            onCopyRaw={handleCopyRawFile}
            onCopySnippet={handleCopySnippet}
          />
        </aside>

        <section className="workspace__pane workspace__pane--center" aria-label="Code editor">
          <div className="pane-header pane-header--editor">
            <h2 className="pane-header__title">
              <PanelsTopLeft size={12} strokeWidth={2} aria-hidden />
              Editor
            </h2>
            <div className="pane-header__editor-meta">
              <span className="pane-header__pill" title={activePath || ""}>
                {activePath || "—"}
              </span>
              <span className="pane-header__pill pane-header__pill--muted" title="Active workspace environment">
                {envMeta.lang}
              </span>
              <button
                type="button"
                className="editor-toolbar-btn"
                onClick={() => handleCopyRawFile()}
                disabled={!activePath}
                title={activePath ? "Copy active file source to clipboard" : "Open a file to copy"}
              >
                <Copy size={14} strokeWidth={2} aria-hidden />
                Copy code
              </button>
              <button
                type="button"
                className="editor-toolbar-btn"
                onClick={() => handleCopySnippet()}
                disabled={!activePath}
                title={
                  activePath
                    ? "Copy active file as Markdown gist block (### title + fenced code)"
                    : "Open a file to copy its gist snippet"
                }
              >
                <ClipboardCopy size={14} strokeWidth={2} aria-hidden />
                Copy snippet
              </button>
              <button
                type="button"
                className="editor-toolbar-btn"
                onClick={handleFormatDocument}
                disabled={!canFormatCode || formatPending || runPending}
                title={
                  !canUseActiveFile
                    ? `Open a ${envMeta.ext} file to format`
                    : !envMeta.formatSupported
                      ? `Format is not available for ${envMeta.lang} yet`
                      : environment === "python"
                        ? "Format with Black (local subprocess; pip install black)"
                        : environment === "csharp"
                          ? "Format with CSharpier (dotnet tool install -g csharpier on the server host)"
                          : "Format with Prettier (in browser)"
                }
              >
                <Wand2 size={14} strokeWidth={2} aria-hidden />
                {formatPending ? "Formatting…" : "Format"}
              </button>
              <button
                type="button"
                className="editor-run-btn"
                onClick={handleRunCode}
                disabled={!canRunCode || runPending || formatPending}
                title={
                  !canUseActiveFile
                    ? `Open a ${envMeta.ext} file to run`
                    : !envMeta.runSupported
                      ? `Run is not available for ${envMeta.lang} yet`
                      : environment === "python"
                        ? "Run active file as Python on the server (subprocess; treat as untrusted)"
                        : "Run active file as JavaScript on the server (vm2 sandbox)"
                }
              >
                <Play size={14} strokeWidth={2} aria-hidden />
                {runPending ? "Running…" : "Run"}
              </button>
            </div>
          </div>
          <div className="editor-column">
            <CodeEditor
              path={activePath}
              editorNonce={editorNonce}
              environment={environment}
              colorTheme={colorTheme}
              value={editorValue}
              onChange={handleEditorChange}
              language={editorLanguage}
            />
            <div
              className={`run-output${runOutputMinimized ? " run-output--minimized" : ""}`}
              role="region"
              aria-label={`${envMeta.lang} run output`}
              aria-expanded={!runOutputMinimized}
            >
              <div className="run-output__head">
                <span className="run-output__head-title">Output</span>
                {runPending ? (
                  <span className="run-output__status run-output__status--pending">Running…</span>
                ) : runMeta ? (
                  <span
                    className={`run-output__status run-output__status--${runMeta.runStatus}`}
                    title={
                      runMeta.runStatus === "timeout" && runMeta.timeoutMs
                        ? `Wall-clock limit ${runMeta.timeoutMs} ms`
                        : "Wall-clock time for this run"
                    }
                  >
                    {runMeta.runStatus === "timeout" && runMeta.timeoutMs
                      ? `Timed out at ${runMeta.timeoutMs} ms`
                      : `Completed in ${runMeta.durationMs} ms`}
                  </span>
                ) : null}
                {runErrorLabel && !runPending ? (
                  <span
                    className={`run-output__error-tag run-output__error-tag--${runMeta?.runStatus === "timeout" ? "timeout" : "error"}`}
                  >
                    {runErrorLabel}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="run-output__min-btn"
                  onClick={() => setRunOutputMinimized((m) => !m)}
                  aria-expanded={!runOutputMinimized}
                  title={runOutputMinimized ? "Expand output panel" : "Minimize output panel"}
                >
                  {runOutputMinimized ? (
                    <ChevronUp size={14} strokeWidth={2} aria-hidden />
                  ) : (
                    <ChevronDown size={14} strokeWidth={2} aria-hidden />
                  )}
                </button>
              </div>
              {!runOutputMinimized ? (
                <div className="run-output__body-wrap">
                  {!runPending && !runOutput && !runError && (
                    <p className="run-output__placeholder">
                      {envMeta.runSupported
                        ? environment === "python"
                          ? "Run sends the active .py tab to the server; stdout and stderr appear below."
                          : "Run sends the active .js file as JavaScript; captured console output appears below."
                        : `Run is not available for ${envMeta.lang} yet.`}
                    </p>
                  )}
                  {runError ? (
                    <div className="run-output__error-block">
                      {runErrorLabel ? (
                        <p className="run-output__error-kind" id="run-output-error-label">
                          {runErrorLabel}
                        </p>
                      ) : null}
                      <pre
                        className="run-output__pre run-output__pre--error"
                        aria-labelledby={runErrorLabel ? "run-output-error-label" : undefined}
                      >
                        {runError}
                      </pre>
                    </div>
                  ) : null}
                  {runOutput ? <pre className="run-output__pre run-output__pre--out">{runOutput}</pre> : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="workspace__pane workspace__pane--right">
          <div className="pane-header">
            <h2 className="pane-header__title">
              <MessageSquare size={12} strokeWidth={2} aria-hidden />
              AI Chat
            </h2>
          </div>
          <ChatPanel
            environment={environment}
            files={files}
            targetFilesByEnv={Object.fromEntries(
              WORKSPACE_ENVIRONMENT_IDS.map((id) => [id, dualWorkspace[id].files]),
            )}
            currentFile={activePath}
            onAiEditProposal={handleAiEditProposal}
            diffPreviewOpen={!!aiEditPreview}
          />
        </aside>
      </div>

      {aiEditPreview && (
        <AiEditPreviewModal
          filename={aiEditPreview.filename}
          original={aiEditPreview.original}
          modified={aiEditPreview.modified}
          language={aiPreviewLanguage}
          colorTheme={colorTheme}
          toolAction={aiEditPreview.action}
          workspaceLabel={aiEditPreview.workspaceLabel}
          onAccept={handleAcceptAiEditPreview}
          onReject={handleRejectAiEditPreview}
        />
      )}

      {toastMessage && (
        <div className="workspace-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
