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

export default function CodeEditor({ value, onChange, language = "javascript" }) {
  return (
    <div className="code-editor">
      <Editor
        height="100%"
        language={language}
        theme="vs-dark"
        value={value}
        onChange={onChange}
        options={DEFAULT_OPTIONS}
      />
    </div>
  );
}
