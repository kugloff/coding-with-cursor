import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutPanelLeft, MessageSquare, PanelsTopLeft, Sparkles } from "lucide-react";
import "./App.css";
import FileExplorer from "./components/FileExplorer.jsx";
import CodeEditor from "./components/CodeEditor.jsx";
import ChatPanel from "./components/ChatPanel.jsx";

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

export default function App() {
  const [workspace, setWorkspace] = useState({
    files: { ...DEFAULT_FILES },
    activePath: "main.js",
  });
  const [editorNonce, setEditorNonce] = useState(0);
  const [aiEditToastVisible, setAiEditToastVisible] = useState(false);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showAiEditToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setAiEditToastVisible(true);
    toastTimerRef.current = window.setTimeout(() => {
      setAiEditToastVisible(false);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  const { files, activePath } = workspace;
  const sortedPaths = useMemo(() => Object.keys(files).sort((a, b) => a.localeCompare(b)), [files]);

  const editorValue = activePath ? files[activePath] ?? "" : "";
  const editorLanguage = activePath ? languageFromFilename(activePath) : "javascript";

  const handleEditorChange = useCallback((value) => {
    const next = value ?? "";
    setWorkspace((w) => {
      if (!w.activePath) return w;
      return {
        ...w,
        files: { ...w.files, [w.activePath]: next },
      };
    });
  }, []);

  const handleSelectFile = useCallback((path) => {
    setWorkspace((w) => {
      if (!(path in w.files)) return w;
      return { ...w, activePath: path };
    });
  }, []);

  const handleCreateFile = useCallback(() => {
    setWorkspace((w) => {
      const name = nextUntitledName(w.files);
      return {
        files: { ...w.files, [name]: "// New file\n" },
        activePath: name,
      };
    });
  }, []);

  const handleChatToolCall = useCallback((tool) => {
    if (!tool || tool.action !== "edit_file") return;
    const filename = typeof tool.filename === "string" ? tool.filename.trim() : "";
    if (!filename || filename.length > 1024) return;
    if (typeof tool.content !== "string") return;
    setWorkspace((w) => ({
      ...w,
      files: { ...w.files, [filename]: tool.content },
      activePath: filename,
    }));
    setEditorNonce((n) => n + 1);
    showAiEditToast();
  }, [showAiEditToast]);

  return (
    <div className="workspace">
      <header className="workspace__topbar">
        <div className="workspace__brand">
          <span className="workspace__brand-icon" aria-hidden>
            <PanelsTopLeft size={18} strokeWidth={1.75} />
          </span>
          <span className="workspace__title">Workspace</span>
        </div>
        <span className="workspace__meta">
          <Sparkles size={12} strokeWidth={2} className="workspace__meta-glow" aria-hidden />
          Vite · React · Monaco
        </span>
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
          <ChatPanel files={files} currentFile={activePath} onToolCall={handleChatToolCall} />
        </aside>
      </div>

      {aiEditToastVisible && (
        <div className="ai-toast" role="status" aria-live="polite">
          File updated by AI
        </div>
      )}
    </div>
  );
}
