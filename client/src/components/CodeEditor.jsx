import Editor from "@monaco-editor/react";

const DEFAULT_OPTIONS = {
  minimap: { enabled: true, scale: 0.9 },
  fontSize: 13,
  fontLigatures: true,
  lineNumbers: "on",
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  padding: { top: 12, bottom: 12 },
  cursorBlinking: "smooth",
  bracketPairColorization: { enabled: true },
  automaticLayout: true,
  tabSize: 2,
};

export default function CodeEditor({ path, editorNonce = 0, value, onChange, language = "javascript" }) {
  const options = {
    ...DEFAULT_OPTIONS,
    readOnly: !path,
  };
  return (
    <div className="code-editor">
      <Editor
        key={`${path || "__none__"}:${editorNonce}`}
        height="100%"
        language={language}
        theme="vs-dark"
        value={value}
        onChange={path ? onChange : undefined}
        options={options}
      />
    </div>
  );
}
