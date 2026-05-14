export default function FileExplorer({ paths, activePath, onSelect, onCreate }) {
  return (
    <div className="file-explorer">
      <div className="file-explorer__toolbar">
        <button type="button" className="file-explorer__new-btn" onClick={onCreate}>
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
                  <span className="file-explorer__file-icon" aria-hidden>
                    ◇
                  </span>
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
