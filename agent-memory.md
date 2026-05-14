This file is the implementation log (source of truth for what was actually built).
It must NOT describe intended features, only implemented changes.

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

### 2026-05-14 — Documentation maintenance policy (process)

- Update **`README.md`** only when **behavior or spec** changes (intended product/API/workspace behavior as the system specification).
- Append **`agent-memory.md`** only for **actual code changes** (including shipped config the code reads, if it materially changes behavior).
- **Do not** duplicate the same information in both files; keep spec/user-facing behavior in **`README.md`**, keep what was built/changed in **`agent-memory.md`**.
- If unsure where something belongs, **prefer `agent-memory.md`** for implementation-level detail and keep **`README.md`** to behavior/spec without repeating that detail.

### 2026-05-14 — Browser `localStorage` workspace persistence

- Added **`client/src/workspaceStorage.js`**: `WORKSPACE_LOCAL_STORAGE_KEY` (`llm:workspace:v1`), `loadPersistedWorkspace()`, `persistWorkspace()`, `clearPersistedWorkspace()`; load filters keys with **`isValidJsWorkspaceFilename`**; invalid/missing storage → caller uses **`DEFAULT_FILES`**.
- **`App.jsx`**: initial `useState` hydrates from `loadPersistedWorkspace()`; `useEffect` on **`workspace`** calls **`persistWorkspace`** (React state remains source of truth); **`handleResetWorkspace`** clears storage, restores **`DEFAULT_FILES`** / **`main.js`**, clears undo/redo refs, bumps **`editorNonce`**, closes AI preview, clears run output state.
- **Undo/redo:** stacks stay in-memory only (not serialized); reset clears both stacks; normal undo/redo unchanged by persistence writes.
- **UI:** top bar **Reset** button (`RotateCcw`); **`App.css`** `.workspace__history-btn--reset`; **`FileExplorer.jsx`** note text updated for persistence.

### 2026-05-14 — Dual-mode AI chat (`POST /chat`: Chat vs Agent)

- **`server/chatBody.js`**: `normalizeChatMode` — only the string **`"agent"`** (trimmed, case-insensitive) selects agent; anything else (including missing) → **`"chat"`**.
- **`server/index.js`**: reads **`body.mode`**, passes normalized **`mode`** into **`generateResponse`**, JSON body includes echoed **`mode`**.
- **`server/services/geminiService.js`**: **`CHAT_MODE_RULES`** / **`AGENT_MODE_RULES`** replace the prior single response-format block; **`buildPromptWithFileContext(..., mode)`**; **`generateResponse`** — **chat** returns trimmed text with **`toolCall: null`** (skips **`parseAssistantModelOutput`**); **agent** parses with **`assistantOutput.js`** and requires a non-null **`toolCall`** or throws **`GeminiApiError`**.
- **`client/src/components/ChatPanel.jsx`**: header mode toggle; every **`POST /chat`** body includes **`mode`**; applies **`onAiEditProposal`** only when **`data.mode === "agent"`** (ignores **`toolCall`** in chat).
- **`client/src/App.css`**: **`.chat-panel__header`**, mode toggle / active button styles.
- **`README.md`**: user guide + **`POST /chat`** spec updated for **`mode`**, Chat vs Agent behavior, and response shape.

### 2026-05-14 — Dual-environment workspace (JS + Python isolation)

- **`client/src/workspaceFilename.js`** / **`server/workspaceFilename.js`**: **`isValidPyWorkspaceFilename`**, **`workspacePyBasenameForRename`**, **`normalizedPyWorkspaceRenameFromDraft`** (mirror JS rules for **`.py`**).
- **`client/src/workspaceFileValidation.js`**: all validators take optional **`environment`** (`"js"` \| `"python"`, default **`"js"`**) and enforce **`.js`** vs **`.py`** names.
- **`client/src/workspaceStorage.js`**: **`DUAL_WORKSPACE_STORAGE_KEY`** (`llm:dualWorkspace:v1`); **`getDefaultDualWorkspace`**, **`loadPersistedDualWorkspace`** (migrates legacy **`llm:workspace:v1`** into the JS slice), **`persistDualWorkspace`**, **`clearPersistedWorkspace`** clears dual + legacy keys.
- **`client/src/App.jsx`**: top-bar **JavaScript** / **Python** switch; state **`{ environment, js: { files, activePath }, python: { files, activePath } }`**; separate undo/redo stacks per environment; **Run** sends **`environment`**; chat receives **`environment`** prop; last-file delete guard; removed per-editor **Run runtime** toggle (environment drives Run + Monaco).
- **`client/src/components/FileExplorer.jsx`**: **`environment`** prop; rename suffix and validation per env.
- **`client/src/components/CodeEditor.jsx`**: **`environment`** in Monaco **`key`** for remount on switch.
- **`client/src/components/ChatPanel.jsx`**: **`environment`** prop; **`POST /chat`** body includes **`environment`**; clears thread on env change; agent tool acceptance gated on **`data.environment`** matching client + extension check for **`.js`** / **`.py`**.
- **`client/src/App.css`**: **`.workspace__env-toggle`** / **`.workspace__env-btn`**; **`.pane-header__pill--muted`**; removed **`.editor-runtime-*`** rules.
- **`server/chatBody.js`**: **`normalizeChatEnvironment`**; **`parseChatContext(..., environment)`** uses **`workspaceChatFileKeyErrorDetail(key, environment)`**.
- **`server/workspaceFileValidation.js`**: **`workspaceChatFileKeyErrorDetail(key, environment)`**.
- **`server/assistantOutput.js`**: **`parseAssistantModelOutput(raw, environment)`** validates tool filenames per env.
- **`server/services/geminiService.js`**: separate CHAT/AGENT rule blocks for JS vs Python; **`buildPromptWithFileContext(..., environment)`**; **`generateResponse({ ..., environment })`**; agent parsing passes **`environment`**.
- **`server/index.js`**: **`POST /chat`** reads **`environment`**, echoes **`environment`**; **`POST /run`** prefers **`body.environment`**, falls back to **`runtime`**; variable renamed internally to **`environment`** for routing.
- **`README.md`**: dual-workspace product spec, **`POST /chat`** / **`POST /run`** **`environment`** field, storage keys, migration.

### 2026-05-14 — Multi-runtime **`POST /run`** (JavaScript + Python)

- **`server/runPython.js`** (new): **`executePython(code)`** — **`spawnSync`** on **`PYTHON_BIN`** or OS default (**`python`** on Windows, **`python3`** elsewhere), args **`["-I", "-u", "-"]`**, script on stdin; stdout/stderr → **`{ output, error }`**; **`ENOENT`** / **`ETIMEDOUT`** handled; timeout from **`RUN_PYTHON_TIMEOUT_MS`** else **`RUN_TIMEOUT_MS`** from **`runCode.js`** (clamped **1–60000**).
- **`server/index.js`**: **`normalizeRunRuntime`** — optional **`body.runtime`**; only **`"python"`** (trimmed, case-insensitive) selects Python; otherwise **`"js"`**; **`executeJavaScript`** unchanged for JS.
- **`server/.env.example`**: documented **`RUN_PYTHON_TIMEOUT_MS`**, **`PYTHON_BIN`**.
- **`client/src/App.jsx`**: **JS** / **Python** segmented control; **`runRuntime`** in **`sessionStorage`** (`llm:runRuntime:v1`); **`POST /run`** body **`{ code, runtime }`**; Monaco **`language`** follows runtime for the active tab; output copy and **`aria-label`** depend on runtime.
- **`client/src/App.css`**: **`.editor-runtime-toggle`**, **`.editor-runtime-btn`**, active state.
- **`README.md`**: Run UX, **`POST /run`** contract, env vars, security note for Python subprocess, troubleshooting, project layout, contributor touchpoints.
