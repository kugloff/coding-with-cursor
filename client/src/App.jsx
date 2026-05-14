import { useCallback, useMemo, useState } from "react";
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

  return (
    <div className="workspace">
      <header className="workspace__topbar">
        <div className="workspace__brand">
          <span className="workspace__logo" aria-hidden>
            ◆
          </span>
          <span className="workspace__title">Workspace</span>
        </div>
        <span className="workspace__meta">Vite · React · Monaco</span>
      </header>

      <div className="workspace__body">
        <aside className="workspace__pane workspace__pane--left">
          <div className="pane-header">
            <h2 className="pane-header__title">Explorer</h2>
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
            <h2 className="pane-header__title">Editor</h2>
            <span className="pane-header__pill" title={activePath || ""}>
              {activePath || "—"}
            </span>
          </div>
          <CodeEditor
            path={activePath}
            value={editorValue}
            onChange={handleEditorChange}
            language={editorLanguage}
          />
        </section>

        <aside className="workspace__pane workspace__pane--right">
          <div className="pane-header">
            <h2 className="pane-header__title">Chat</h2>
          </div>
          <ChatPanel />
        </aside>
      </div>
    </div>
  );
}
