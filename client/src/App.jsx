import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  LayoutPanelLeft,
  MessageSquare,
  PanelsTopLeft,
  Play,
  Redo2,
  RotateCcw,
  Sparkles,
  Undo2,
} from "lucide-react";
import "./App.css";
import FileExplorer from "./components/FileExplorer.jsx";
import CodeEditor from "./components/CodeEditor.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import AiEditPreviewModal from "./components/AiEditPreviewModal.jsx";
import { isValidJsWorkspaceFilename, isValidPyWorkspaceFilename } from "./workspaceFilename.js";
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

function editorLanguageForWorkspacePath(filename) {
  if (!filename) return "javascript";
  return isValidJsWorkspaceFilename(filename) ? "javascript" : "plaintext";
}

function nextUntitledName(files, environment) {
  const ext = environment === "python" ? ".py" : ".js";
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
  const [aiEditToastFile, setAiEditToastFile] = useState(null);
  const [runOutput, setRunOutput] = useState("");
  const [runError, setRunError] = useState("");
  const [runPending, setRunPending] = useState(false);
  const [runOutputMinimized, setRunOutputMinimized] = useState(false);
  const toastTimerRef = useRef(null);
  const undoByEnv = useRef({ js: [], python: [] });
  const redoByEnv = useRef({ js: [], python: [] });
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
        "Reset both JavaScript and Python workspaces to defaults? This removes the saved copy in this browser and clears undo/redo for both environments.",
      )
    ) {
      return;
    }
    clearPersistedWorkspace();
    undoByEnv.current = { js: [], python: [] };
    redoByEnv.current = { js: [], python: [] };
    bumpHistoryUi();
    resetManualEditGroup();
    setDualWorkspace(getDefaultDualWorkspace());
    setEditorNonce((n) => n + 1);
    setAiEditPreview(null);
    setRunOutput("");
    setRunError("");
    setRunOutputMinimized(false);
  }, [bumpHistoryUi, resetManualEditGroup]);

  const showAiEditToast = useCallback((message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setAiEditToastFile(typeof message === "string" && message.trim() ? message.trim() : "Saved.");
    toastTimerRef.current = window.setTimeout(() => {
      setAiEditToastFile(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  const sortedPaths = useMemo(() => Object.keys(files).sort((a, b) => a.localeCompare(b)), [files]);

  const editorValue = activePath ? files[activePath] ?? "" : "";
  const editorLanguage =
    environment === "python"
      ? isValidPyWorkspaceFilename(activePath)
        ? "python"
        : "plaintext"
      : editorLanguageForWorkspacePath(activePath);

  const canRunCode = Boolean(
    activePath &&
      (environment === "python" ? isValidPyWorkspaceFilename(activePath) : isValidJsWorkspaceFilename(activePath)),
  );

  useEffect(() => {
    setRunOutput("");
    setRunError("");
  }, [activePath, environment]);

  const handleRunCode = useCallback(async () => {
    const env = dualWorkspaceRef.current.environment;
    const slice = dualWorkspaceRef.current[env];
    const ap = slice.activePath;
    if (!ap) return;
    if (env === "python" && !isValidPyWorkspaceFilename(ap)) return;
    if (env === "js" && !isValidJsWorkspaceFilename(ap)) return;
    const code = typeof slice.files[ap] === "string" ? slice.files[ap] : "";
    setRunPending(true);
    setRunOutputMinimized(false);
    setRunError("");
    setRunOutput("");
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
          return;
        }
      }
      const out = typeof data.output === "string" ? data.output : "";
      const err = typeof data.error === "string" ? data.error : "";
      setRunOutput(out);
      setRunError(err);
      if (!res.ok && !err) {
        setRunError(typeof data.detail === "string" ? data.detail : `HTTP ${res.status}`);
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Could not reach server");
    } finally {
      setRunPending(false);
    }
  }, []);

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
      const starter = dw.environment === "python" ? "# New file\n" : "// New file\n";
      return {
        ...dw,
        [dw.environment]: {
          files: { ...cur.files, [name]: starter },
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
    (tool) => {
      if (!tool || (tool.action !== "edit_file" && tool.action !== "create_file")) return;
      const e = dualWorkspaceRef.current.environment;
      const w = dualWorkspaceRef.current[e];
      const filenameRaw = typeof tool.filename === "string" ? tool.filename : "";
      const v = validateWorkspaceAiFileTarget(filenameRaw, w.files, tool.action, e);
      if (!v.ok) return;
      const filename = v.filename;
      if (typeof tool.content !== "string") return;
      pushUndoSnapshot(cloneWorkspace(w));
      resetManualEditGroup();
      setDualWorkspace((dw) => ({
        ...dw,
        [e]: {
          ...dw[e],
          files: { ...dw[e].files, [filename]: tool.content },
          activePath: filename,
        },
      }));
      setEditorNonce((n) => n + 1);
      const toastMsg =
        tool.action === "create_file"
          ? `File created by AI: ${filename}`
          : `File updated by AI: ${filename}`;
      showAiEditToast(toastMsg);
    },
    [pushUndoSnapshot, resetManualEditGroup, showAiEditToast],
  );

  const handleAiEditProposal = useCallback(
    (tool) => {
      if (!tool || (tool.action !== "edit_file" && tool.action !== "create_file")) return;
      const e = dualWorkspaceRef.current.environment;
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
      });
    },
    [],
  );

  const handleAcceptAiEditPreview = useCallback(() => {
    if (!aiEditPreview) return;
    applyAiFileEdit({
      action: aiEditPreview.action,
      filename: aiEditPreview.filename,
      content: aiEditPreview.modified,
    });
    setAiEditPreview(null);
  }, [aiEditPreview, applyAiFileEdit]);

  const handleRejectAiEditPreview = useCallback(() => {
    setAiEditPreview(null);
  }, []);

  const aiPreviewLanguage = useMemo(() => {
    if (!aiEditPreview) return "plaintext";
    if (environment === "python") {
      return isValidPyWorkspaceFilename(aiEditPreview.filename) ? "python" : "plaintext";
    }
    return editorLanguageForWorkspacePath(aiEditPreview.filename);
  }, [aiEditPreview, environment]);

  const setEnvironment = useCallback((next) => {
    const n = next === "python" ? "python" : "js";
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
          <div className="workspace__env-toggle" role="group" aria-label="Workspace environment">
            <button
              type="button"
              className={`workspace__env-btn${environment === "js" ? " workspace__env-btn--active" : ""}`}
              onClick={() => setEnvironment("js")}
              disabled={runPending}
              aria-pressed={environment === "js"}
            >
              JavaScript
            </button>
            <button
              type="button"
              className={`workspace__env-btn${environment === "python" ? " workspace__env-btn--active" : ""}`}
              onClick={() => setEnvironment("python")}
              disabled={runPending}
              aria-pressed={environment === "python"}
            >
              Python
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
                {environment === "python" ? "Python" : "JS"}
              </span>
              <button
                type="button"
                className="editor-run-btn"
                onClick={handleRunCode}
                disabled={!canRunCode || runPending}
                title={
                  !canRunCode
                    ? environment === "python"
                      ? "Open a .py file to run"
                      : "Open a .js file to run"
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
              value={editorValue}
              onChange={handleEditorChange}
              language={editorLanguage}
            />
            <div
              className={`run-output${runOutputMinimized ? " run-output--minimized" : ""}`}
              role="region"
              aria-label={environment === "python" ? "Python run output" : "JavaScript run output"}
              aria-expanded={!runOutputMinimized}
            >
              <div className="run-output__head">
                <span className="run-output__head-title">Output</span>
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
                  {runPending && <p className="run-output__placeholder">Running…</p>}
                  {!runPending && !runOutput && !runError && (
                    <p className="run-output__placeholder">
                      {environment === "python"
                        ? "Run sends the active .py tab to the server; stdout and stderr appear below."
                        : "Run sends the active .js file as JavaScript; captured console output appears below."}
                    </p>
                  )}
                  {runError ? (
                    <pre className="run-output__pre run-output__pre--error">{runError}</pre>
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
          toolAction={aiEditPreview.action}
          onAccept={handleAcceptAiEditPreview}
          onReject={handleRejectAiEditPreview}
        />
      )}

      {aiEditToastFile && (
        <div className="ai-toast" role="status" aria-live="polite">
          {aiEditToastFile}
        </div>
      )}
    </div>
  );
}
