import { File, FileCode, FileJson, FileText, Plus } from "lucide-react";

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

export default function FileExplorer({ paths, activePath, onSelect, onCreate }) {
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
            return (
              <li key={path} className="file-explorer__item">
                <button
                  type="button"
                  className={`file-explorer__file-btn${isActive ? " file-explorer__file-btn--active" : ""}`}
                  onClick={() => onSelect(path)}
                  aria-current={isActive ? "true" : undefined}
                >
                  <FileGlyph path={path} />
                  <span className="file-explorer__file-name">{path}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
