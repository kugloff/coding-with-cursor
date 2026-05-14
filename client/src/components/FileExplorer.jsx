import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  FileCode,
  PencilLine,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { workspaceJsBasenameForRename } from "../workspaceFilename.js";
import { validateWorkspaceRename } from "../workspaceFileValidation.js";

function FileGlyph() {
  const p = { className: "file-explorer__glyph", size: 15, strokeWidth: 1.75, "aria-hidden": true };
  return <FileCode {...p} />;
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
    setRenameDraft(workspaceJsBasenameForRename(path));
  }

  function cancelRename() {
    setRenamingPath(null);
    setRenameDraft("");
  }

  function commitRename(e) {
    e.preventDefault();
    if (!renamingPath) return;
    const v = validateWorkspaceRename(renameDraft, paths, renamingPath);
    if (!v.ok) {
      window.alert(v.message);
      return;
    }
    const ok = onRenameFile?.(renamingPath, v.filename);
    if (ok) cancelRename();
    else window.alert("Could not rename: invalid name, or a file with that name already exists.");
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
      <p className="file-explorer__note">In-memory .js files only — refresh clears files.</p>
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
                    <FileGlyph />
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
                      aria-label="File base name (extension stays .js)"
                      title='Only the name before ".js" can change; any extension you type is ignored.'
                    />
                    <span className="file-explorer__rename-suffix" aria-hidden>
                      .js
                    </span>
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
                    <FileGlyph />
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
