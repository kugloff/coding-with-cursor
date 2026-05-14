import { useEffect } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { Check, X } from "lucide-react";

const DIFF_OPTIONS = {
  readOnly: true,
  renderSideBySide: true,
  scrollBeyondLastLine: false,
  minimap: { enabled: false },
  fontSize: 13,
  automaticLayout: true,
  lineNumbers: "on",
  padding: { top: 8, bottom: 8 },
};

export default function AiEditPreviewModal({
  filename,
  original,
  modified,
  language = "plaintext",
  toolAction = "edit_file",
  onAccept,
  onReject,
}) {
  const isCreate = toolAction === "create_file";
  const title = isCreate ? "Review new file" : "Review AI changes";
  const acceptLabel = isCreate ? "Accept & create file" : "Accept changes";
  const pathLabel = isCreate ? "New file" : "File";

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onReject();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onReject]);

  return (
    <div className="ai-edit-preview" role="dialog" aria-modal="true" aria-labelledby="ai-edit-preview-title">
      <button
        type="button"
        className="ai-edit-preview__backdrop"
        aria-label="Dismiss diff preview"
        onClick={onReject}
      />
      <div className="ai-edit-preview__panel">
        <header className="ai-edit-preview__header">
          <h2 id="ai-edit-preview-title" className="ai-edit-preview__title">
            {title}
          </h2>
          <p className="ai-edit-preview__path" title={filename}>
            <span className="ai-edit-preview__path-label">{pathLabel}</span> {filename}
          </p>
        </header>
        <div className="ai-edit-preview__diff-wrap">
          <DiffEditor
            key={`${filename}:${toolAction}:${original.length}:${modified.length}`}
            height="100%"
            language={language}
            original={original}
            modified={modified}
            theme="vs-dark"
            options={DIFF_OPTIONS}
          />
        </div>
        <footer className="ai-edit-preview__footer">
          <button type="button" className="ai-edit-preview__btn ai-edit-preview__btn--ghost" onClick={onReject}>
            <X size={16} strokeWidth={2} aria-hidden />
            Reject
          </button>
          <button type="button" className="ai-edit-preview__btn ai-edit-preview__btn--primary" onClick={onAccept}>
            <Check size={16} strokeWidth={2.5} aria-hidden />
            {acceptLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
