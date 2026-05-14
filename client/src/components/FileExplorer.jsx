const PLACEHOLDER_FILES = [
  { id: "app", label: "App.jsx", indent: 1 },
  { id: "main", label: "main.jsx", indent: 1 },
];

export default function FileExplorer() {
  return (
    <div className="file-explorer">
      <div className="file-explorer__hint">
        <span className="file-explorer__badge">Placeholder</span>
        <p>File tree will connect to your project later.</p>
      </div>
      <ul className="file-explorer__list" aria-label="File explorer (placeholder)">
        <li className="file-explorer__row file-explorer__row--folder">
          <span className="file-explorer__chevron" aria-hidden>
            ▾
          </span>
          <span className="file-explorer__name">src</span>
        </li>
        {PLACEHOLDER_FILES.map((f) => (
          <li
            key={f.id}
            className="file-explorer__row file-explorer__row--file"
            style={{ paddingLeft: `${0.5 + f.indent * 0.75}rem` }}
          >
            <span className="file-explorer__icon" aria-hidden>
              ◇
            </span>
            <span className="file-explorer__name">{f.label}</span>
          </li>
        ))}
        <li className="file-explorer__row file-explorer__row--file">
          <span className="file-explorer__icon" aria-hidden>
            ◇
          </span>
          <span className="file-explorer__name">README.md</span>
        </li>
      </ul>
    </div>
  );
}
