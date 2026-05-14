# Agent memory (implementation changelog)

**Rules**

- Append **only** factual implementation changes (new entries at the **bottom** of the log).
- Do **not** rewrite, reorder, or remove existing entries unless explicitly asked.
- Keep entries structured (headings, bullets). Prefer dates in **`YYYY-MM-DD`** when known.

---

## Chronological log

### 2026-05-14 — Implementation baseline (consolidated from repository / `README.md`)

**Stack**

- Monorepo: root `package.json` with `concurrently`; **`server/`** Express (ESM), **`client/`** Vite 6 + React 19 + Monaco + lucide-react.
- Default URLs: API `http://localhost:3001`, UI `http://localhost:5173`.

**Virtual workspace**

- In-memory `files` map + `activePath` in **`client/src/App.jsx`**; not persisted; refresh restores **`DEFAULT_FILES`** (`main.js` only).
- Workspace paths: single-segment names ending in **`.js`** (case-insensitive); no `/` or `\`; max 1024 chars.
- **`client/src/workspaceFilename.js`**: `isValidJsWorkspaceFilename`, `workspaceJsBasenameForRename`, `normalizedJsWorkspaceRenameFromDraft`.
- **`client/src/workspaceFileValidation.js`**: `validateWorkspaceFilename`, `validateWorkspaceCreate`, `validateWorkspaceRename`, `validateWorkspaceRenameTarget`, `validateWorkspaceExistingPath`, `validateWorkspaceAiFileTarget`; used in **`App.jsx`** (rename, delete, untitled names, AI apply/proposal) and **`FileExplorer.jsx`** (rename commit).
- **`server/workspaceFilename.js`**: mirrors client filename rules.
- **`server/workspaceFileValidation.js`**: `workspaceChatFileKeyErrorDetail`; used by **`server/chatBody.js`** `parseChatContext` for each `files` key and `currentFile`.
- **`server/assistantOutput.js`**: `parseAssistantModelOutput`; rejects tool `filename` not ending in `.js` (returns policy text, `toolCall: null`).
- **`server/services/geminiService.js`**: `RESPONSE_FORMAT_RULES` + prompts steer JavaScript-only workspace and `.js` tool paths; model `gemini-2.5-flash` (`MODEL_NAME`); context caps `MAX_CONTEXT_CHARS`, `MAX_FILE_CHARS`.
- Rename UI: basename field + fixed **`.js`** suffix; extension coerced via `normalizedJsWorkspaceRenameFromDraft`.

**Chat (`POST /chat`)**

- Body: `message` (required), optional `files`, `currentFile`; max 200 files; validated `*.js` keys.
- **`generateResponse`** → **`parseAssistantModelOutput`**; tool actions `edit_file` / `create_file`.
- Client: **`ChatPanel.jsx`** `fetch("/chat")`; **`onAiEditProposal`** → **`AiEditPreviewModal`**; accept/reject; **`applyAiFileEdit`**; **`editorNonce`**; toast.

**Run (`POST /run`)**

- **`server/runCode.js`**: `executeJavaScript(code)`; **`vm2`** `VM`; sandbox **only** stub `console`; `eval: false`, `wasm: false`, `allowAsync: false`, `bufferAllocLimit` 1 MiB; `RUN_TIMEOUT_MS` default 1000 ms from **`RUN_VM_TIMEOUT_MS`** env (clamped 1–60000) at module load; `MAX_RUN_CODE_CHARS` 500_000; strict wrapper.
- Client: **`App.jsx`** Run button + output panel; minimize/expand chevron; Vite proxy `/run` → Express.

**UI / client modules**

- **`FileExplorer.jsx`**, **`CodeEditor.jsx`**, **`ChatPanel.jsx`**, **`AiEditPreviewModal.jsx`**; styles **`App.css`**, **`index.css`**; **`vite.config.js`** proxies `/api`, `/chat`, `/run`; Monaco plugin default interop pattern documented.

**Workspace undo/redo**

- Top bar; stacks max 40; snapshots `{ files, activePath }` shallow clone; typing-burst grouping as documented in README.

---

### 2026-05-14 — Documentation: `agent-memory.md` + `README.md` restructure

- Added **`agent-memory.md`** (this file) with append-only changelog rules and baseline + session entries.
- Restructured **`README.md`** into TOC-driven **application documentation** (overview, quick start, configuration, user guide, API reference, project layout, build/deploy, security, troubleshooting, contributor/AI notes) and linked to **`agent-memory.md`** for implementation history.
