import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Braces,
  Check,
  File,
  FileCode,
  FileJson,
  FileText,
  Image,
  PencilLine,
  Plus,
  Settings2,
  Terminal,
  Trash2,
  X,
} from "lucide-react";

const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp"]);
const SHELL_EXT = new Set([".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd"]);

function FileGlyph({ path }) {
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "";
  const p = { className: "file-explorer__glyph", size: 15, strokeWidth: 1.75, "aria-hidden": true };
  if (ext === ".json") return <FileJson {...p} />;
  if (ext === ".md" || ext === ".txt") return <FileText {...p} />;
  if (ext === ".yml" || ext === ".yaml") return <Braces {...p} />;
  if (ext === ".env") return <Settings2 {...p} />;
  if (IMG_EXT.has(ext)) return <Image {...p} />;
  if (SHELL_EXT.has(ext)) return <Terminal {...p} />;
  if (
    ext === ".js" ||
    ext === ".jsx" ||
    ext === ".mjs" ||
    ext === ".cjs" ||
    ext === ".ts" ||
    ext === ".tsx" ||
    ext === ".vue" ||
    ext === ".svelte" ||
    ext === ".css" ||
    ext === ".html" ||
    ext === ".py" ||
    ext === ".rs" ||
    ext === ".go" ||
    ext === ".rb" ||
    ext === ".php" ||
    ext === ".sql" ||
    ext === ".toml"
  ) {
    return <FileCode {...p} />;
  }
  return <File {...p} />;
}

const CONTEXT_MENU_W = 168;
const CONTEXT_MENU_H = 88;

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
  const [contextMenu, setContextMenu] = useState(null);
  const renameInputRef = useRef(null);
  const listRef = useRef(null);
  const menuRef = useRef(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPath]);

  useEffect(() => {
    if (!contextMenu) return;

    function onKeyDown(e) {
      if (e.key === "Escape") closeContextMenu();
    }

    function onPointerDown(e) {
      if (menuRef.current?.contains(e.target)) return;
      closeContextMenu();
    }

    function onScroll() {
      closeContextMenu();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    const listEl = listRef.current;
    listEl?.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
      listEl?.removeEventListener("scroll", onScroll);
    };
  }, [contextMenu, closeContextMenu]);

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

  function openContextMenu(e, path) {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - CONTEXT_MENU_W - 8));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - CONTEXT_MENU_H - 8));
    setContextMenu({ x, y, path });
  }

  const contextPortal =
    contextMenu &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        <div
          className="file-explorer__context-backdrop"
          aria-hidden
          onClick={closeContextMenu}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div
          ref={menuRef}
          className="file-explorer__context-menu"
          role="menu"
          aria-label="File actions"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="file-explorer__context-item"
            role="menuitem"
            onClick={() => {
              beginRename(contextMenu.path);
              closeContextMenu();
            }}
          >
            <PencilLine size={14} strokeWidth={2} aria-hidden />
            Rename
          </button>
          <button
            type="button"
            className="file-explorer__context-item file-explorer__context-item--danger"
            role="menuitem"
            onClick={() => {
              handleDelete(contextMenu.path);
              closeContextMenu();
            }}
          >
            <Trash2 size={14} strokeWidth={2} aria-hidden />
            Delete
          </button>
        </div>
      </>,
      document.body
    );

  return (
    <div className="file-explorer">
      <div className="file-explorer__toolbar">
        <button type="button" className="file-explorer__new-btn" onClick={onCreate}>
          <Plus size={15} strokeWidth={2} aria-hidden />
          New file
        </button>
      </div>
      <p className="file-explorer__note">In-memory only — refresh clears files.</p>
      <ul ref={listRef} className="file-explorer__list" aria-label="Files">
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
                    <FileGlyph path={path} />
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
              <li key={path} className="file-explorer__item" onContextMenu={(e) => openContextMenu(e, path)}>
                <div className={`file-explorer__row${isActive ? " file-explorer__row--active" : ""}`}>
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
      {contextPortal}
    </div>
  );
}
