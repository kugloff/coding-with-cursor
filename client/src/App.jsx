import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutPanelLeft, MessageSquare, PanelsTopLeft, Redo2, Sparkles, Undo2 } from "lucide-react";
import "./App.css";
import FileExplorer from "./components/FileExplorer.jsx";
import CodeEditor from "./components/CodeEditor.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import AiEditPreviewModal from "./components/AiEditPreviewModal.jsx";

const DEFAULT_FILES = {
  "main.js": `// Welcome — edit freely
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Monaco"));
`,
};

function languageFromFilename(filename) {
  const i = filename.lastIndexOf(".");
  if (i === -1) return "plaintext";
  const ext = filename.slice(i).toLowerCase();
  const map = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".json": "json",
    ".css": "css",
    ".html": "html",
    ".md": "markdown",
  };
  return map[ext] ?? "plaintext";
}

function nextUntitledName(files) {
  let n = 1;
  let name = `untitled-${n}.js`;
  while (name in files) {
    n += 1;
    name = `untitled-${n}.js`;
  }
  return name;
}

const MAX_UNDO = 40;

/** Shallow snapshot: new `files` object, same string values. */
function cloneWorkspace(w) {
  return { files: { ...w.files }, activePath: w.activePath };
}

export default function App() {
  const [workspace, setWorkspace] = useState({
    files: { ...DEFAULT_FILES },
    activePath: "main.js",
  });
  const [editorNonce, setEditorNonce] = useState(0);
  /** Pending AI `edit_file` — side-by-side diff before apply. */
  const [aiEditPreview, setAiEditPreview] = useState(null);
  /** `null` = hidden; otherwise toast shows which file the AI updated. */
  const [aiEditToastFile, setAiEditToastFile] = useState(null);
  const toastTimerRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  /** Bumps when undo or redo stacks change so the top bar re-renders. */
  const [historyTick, setHistoryTick] = useState(0);
  /** One undo entry per “typing burst” per file until select / other op resets. */
  const manualEditGroupRef = useRef({ path: null, captured: false });

  const workspaceRef = useRef(workspace);
  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

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
      redoStackRef.current = [];
      const stack = undoStackRef.current;
      const next = [...stack, snapshot];
      undoStackRef.current = next.length > MAX_UNDO ? next.slice(-MAX_UNDO) : next;
      bumpHistoryUi();
    },
    [bumpHistoryUi],
  );

  const resetManualEditGroup = useCallback(() => {
    manualEditGroupRef.current = { path: null, captured: false };
  }, []);

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const current = cloneWorkspace(workspaceRef.current);
    const previous = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    const rstack = redoStackRef.current;
    const rnext = [...rstack, current];
    redoStackRef.current = rnext.length > MAX_UNDO ? rnext.slice(-MAX_UNDO) : rnext;
    bumpHistoryUi();
    resetManualEditGroup();
    setWorkspace(previous);
    setEditorNonce((n) => n + 1);
  }, [bumpHistoryUi, resetManualEditGroup]);

  const handleRedo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const current = cloneWorkspace(workspaceRef.current);
    const nextState = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    const ustack = undoStackRef.current;
    const unext = [...ustack, current];
    undoStackRef.current = unext.length > MAX_UNDO ? unext.slice(-MAX_UNDO) : unext;
    bumpHistoryUi();
    resetManualEditGroup();
    setWorkspace(nextState);
    setEditorNonce((n) => n + 1);
  }, [bumpHistoryUi, resetManualEditGroup]);

  const showAiEditToast = useCallback((filename) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setAiEditToastFile(typeof filename === "string" && filename.trim() ? filename.trim() : "file");
    toastTimerRef.current = window.setTimeout(() => {
      setAiEditToastFile(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  const { files, activePath } = workspace;
  const sortedPaths = useMemo(() => Object.keys(files).sort((a, b) => a.localeCompare(b)), [files]);

  const editorValue = activePath ? files[activePath] ?? "" : "";
  const editorLanguage = activePath ? languageFromFilename(activePath) : "javascript";

  const handleEditorChange = useCallback(
    (value) => {
      const next = value ?? "";
      const w = workspaceRef.current;
      if (!w.activePath) return;
      const path = w.activePath;
      const g = manualEditGroupRef.current;
      if (g.path !== path || !g.captured) {
        pushUndoSnapshot(cloneWorkspace(w));
        manualEditGroupRef.current = { path, captured: true };
      }
      setWorkspace((cur) => ({
        ...cur,
        files: { ...cur.files, [path]: next },
      }));
    },
    [pushUndoSnapshot],
  );

  const handleSelectFile = useCallback((path) => {
    resetManualEditGroup();
    setWorkspace((w) => {
      if (!(path in w.files)) return w;
      return { ...w, activePath: path };
    });
  }, [resetManualEditGroup]);

  const handleCreateFile = useCallback(() => {
    pushUndoSnapshot(cloneWorkspace(workspaceRef.current));
    resetManualEditGroup();
    setWorkspace((w) => {
      const name = nextUntitledName(w.files);
      return {
        files: { ...w.files, [name]: "// New file\n" },
        activePath: name,
      };
    });
  }, [pushUndoSnapshot, resetManualEditGroup]);

  const handleDeleteFile = useCallback((path) => {
    if (!window.confirm(`Delete "${path}"?`)) return;
    pushUndoSnapshot(cloneWorkspace(workspaceRef.current));
    resetManualEditGroup();
    setWorkspace((w) => {
      if (!(path in w.files)) return w;
      const { [path]: removed, ...rest } = w.files;
      void removed;
      const keys = Object.keys(rest).sort((a, b) => a.localeCompare(b));
      const nextActive = w.activePath === path ? keys[0] ?? null : w.activePath;
      return { files: rest, activePath: nextActive };
    });
    setEditorNonce((n) => n + 1);
  }, [pushUndoSnapshot, resetManualEditGroup]);

  const handleRenameFile = useCallback((oldPath, newPath) => {
    const w = workspaceRef.current;
    const next = typeof newPath === "string" ? newPath.trim() : "";
    if (!(oldPath in w.files)) return false;
    if (!next || next.length > 1024) return false;
    if (/[/\\]/.test(next)) return false;
    if (next === oldPath) return true;
    if (next in w.files) return false;
    pushUndoSnapshot(cloneWorkspace(w));
    resetManualEditGroup();
    const content = w.files[oldPath];
    const { [oldPath]: _, ...rest } = w.files;
    setWorkspace({
      files: { ...rest, [next]: content },
      activePath: w.activePath === oldPath ? next : w.activePath,
    });
    return true;
  }, [pushUndoSnapshot, resetManualEditGroup]);

  const applyAiFileEdit = useCallback((tool) => {
    if (!tool || tool.action !== "edit_file") return;
    const filename = typeof tool.filename === "string" ? tool.filename.trim() : "";
    if (!filename || filename.length > 1024) return;
    if (typeof tool.content !== "string") return;
    pushUndoSnapshot(cloneWorkspace(workspaceRef.current));
    resetManualEditGroup();
    setWorkspace((w) => ({
      ...w,
      files: { ...w.files, [filename]: tool.content },
      activePath: filename,
    }));
    setEditorNonce((n) => n + 1);
    showAiEditToast(filename);
  }, [pushUndoSnapshot, resetManualEditGroup, showAiEditToast]);

  const handleAiEditProposal = useCallback((tool) => {
    if (!tool || tool.action !== "edit_file") return;
    const filename = typeof tool.filename === "string" ? tool.filename.trim() : "";
    if (!filename || filename.length > 1024) return;
    if (typeof tool.content !== "string") return;
    const w = workspaceRef.current;
    const original = filename in w.files ? w.files[filename] ?? "" : "";
    setAiEditPreview({ filename, original, modified: tool.content });
  }, []);

  const handleAcceptAiEditPreview = useCallback(() => {
    if (!aiEditPreview) return;
    applyAiFileEdit({
      action: "edit_file",
      filename: aiEditPreview.filename,
      content: aiEditPreview.modified,
    });
    setAiEditPreview(null);
  }, [aiEditPreview, applyAiFileEdit]);

  const handleRejectAiEditPreview = useCallback(() => {
    setAiEditPreview(null);
  }, []);

  const aiPreviewLanguage = useMemo(
    () => (aiEditPreview ? languageFromFilename(aiEditPreview.filename) : "plaintext"),
    [aiEditPreview],
  );

  const canUndo = useMemo(() => undoStackRef.current.length > 0, [historyTick]);
  const canRedo = useMemo(() => redoStackRef.current.length > 0, [historyTick]);

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
            <span className="pane-header__pill" title={activePath || ""}>
              {activePath || "—"}
            </span>
          </div>
          <CodeEditor
            path={activePath}
            editorNonce={editorNonce}
            value={editorValue}
            onChange={handleEditorChange}
            language={editorLanguage}
          />
        </section>

        <aside className="workspace__pane workspace__pane--right">
          <div className="pane-header">
            <h2 className="pane-header__title">
              <MessageSquare size={12} strokeWidth={2} aria-hidden />
              AI Chat
            </h2>
          </div>
          <ChatPanel
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
          onAccept={handleAcceptAiEditPreview}
          onReject={handleRejectAiEditPreview}
        />
      )}

      {aiEditToastFile && (
        <div className="ai-toast" role="status" aria-live="polite">
          File updated by AI: {aiEditToastFile}
        </div>
      )}
    </div>
  );
}
