import { useEffect, useRef, useState } from "react";
import { Check, File, FileCode, FileJson, FileText, PencilLine, Plus, Trash2, X } from "lucide-react";

function FileGlyph({ path }) {
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "";
  const p = { className: "file-explorer__glyph", size: 15, strokeWidth: 1.75, "aria-hidden": true };
  if (ext === ".json") return <FileJson {...p} />;
  if (ext === ".md" || ext === ".txt") return <FileText {...p} />;
  if (
    ext === ".js" ||
    ext === ".jsx" ||
    ext === ".mjs" ||
    ext === ".cjs" ||
    ext === ".ts" ||
    ext === ".tsx" ||
    ext === ".css" ||
    ext === ".html"
  ) {
    return <FileCode {...p} />;
  }
  return <File {...p} />;
}

export default function FileExplorer({
  paths,
  activePath,
  onSelect,
  onCreate,
  onDeleteFile,
  onRenameFile,
}) {
  const [renamingPath, setRenamingPath] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef(null);

  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPath]);

  function beginRename(path) {
    setRenamingPath(path);
    setRenameDraft(path);
  }

  function cancelRename() {
    setRenamingPath(null);
    setRenameDraft("");
  }

  function commitRename(e) {
    e.preventDefault();
    if (!renamingPath) return;
    const draft = renameDraft.trim();
    if (!draft) {
      window.alert("File name cannot be empty.");
      return;
    }
    if (draft !== renamingPath && paths.includes(draft)) {
      window.alert(`A file named "${draft}" already exists.`);
      return;
    }
    const ok = onRenameFile?.(renamingPath, draft);
    if (ok) cancelRename();
    else window.alert('Could not rename: invalid name, or a file with that name already exists.');
  }

  function handleDelete(path) {
    onDeleteFile?.(path);
    if (renamingPath === path) cancelRename();
  }

  return (
    <div className="file-explorer">
      <div className="file-explorer__toolbar">
        <button type="button" className="file-explorer__new-btn" onClick={onCreate}>
          <Plus size={15} strokeWidth={2} aria-hidden />
          New file
        </button>
      </div>
      <p className="file-explorer__note">In-memory only — refresh clears files.</p>
      <ul className="file-explorer__list" aria-label="Files">
        {paths.length === 0 ? (
          <li className="file-explorer__empty">No files yet.</li>
        ) : (
          paths.map((path) => {
            const isActive = path === activePath;
            const isRenaming = renamingPath === path;

            if (isRenaming) {
              return (
                <li key={path} className="file-explorer__item file-explorer__item--rename">
                  <form className="file-explorer__rename" onSubmit={commitRename}>
                    <input
                      ref={renameInputRef}
                      className="file-explorer__rename-input"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      aria-label="New file name"
                    />
                    <div className="file-explorer__rename-actions">
                      <button type="submit" className="file-explorer__rename-save" aria-label="Save name">
                        <Check size={14} strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        className="file-explorer__rename-cancel"
                        aria-label="Cancel rename"
                        onClick={cancelRename}
                      >
                        <X size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  </form>
                </li>
              );
            }

            return (
              <li key={path} className="file-explorer__item">
                <div className="file-explorer__row">
                  <button
                    type="button"
                    className={`file-explorer__file-btn${isActive ? " file-explorer__file-btn--active" : ""}`}
                    onClick={() => onSelect(path)}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <FileGlyph path={path} />
                    <span className="file-explorer__file-name">{path}</span>
                  </button>
                  <div className="file-explorer__actions">
                    <button
                      type="button"
                      className="file-explorer__icon-btn"
                      aria-label={`Rename ${path}`}
                      title="Rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginRename(path);
                      }}
                    >
                      <PencilLine size={14} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className="file-explorer__icon-btn file-explorer__icon-btn--danger"
                      aria-label={`Delete ${path}`}
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(path);
                      }}
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
