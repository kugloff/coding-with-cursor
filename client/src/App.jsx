import { useCallback, useState } from "react";
import "./App.css";
import FileExplorer from "./components/FileExplorer.jsx";
import CodeEditor from "./components/CodeEditor.jsx";
import ChatPanel from "./components/ChatPanel.jsx";

const INITIAL_CODE = `// Welcome — edit freely
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("Monaco"));
`;

export default function App() {
  const [code, setCode] = useState(INITIAL_CODE);

  const handleEditorChange = useCallback((value) => {
    setCode(value ?? "");
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
          <FileExplorer />
        </aside>

        <section className="workspace__pane workspace__pane--center" aria-label="Code editor">
          <div className="pane-header pane-header--editor">
            <h2 className="pane-header__title">Editor</h2>
            <span className="pane-header__pill">main.js</span>
          </div>
          <CodeEditor value={code} onChange={handleEditorChange} language="javascript" />
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
