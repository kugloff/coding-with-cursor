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

### 2026-05-15 — Compact Gemini prompts (lower instruction tokens)

- **`server/services/geminiService.js`**: Replaced four long static rule blocks with **`ENV_META`** + **`rulesForModeAndEnvironment(mode, environment)`** (same CHAT vs AGENT and JS vs Python constraints, shorter wording). **`buildPromptWithFileContext`** uses one-line role intro, short tags **`[paths]`**, **`[active]`**, **`[file <path>]`**, **`[user]`** (dropped duplicate active-file section and long `---` headers). Truncation markers shortened. No change to **`MAX_CONTEXT_CHARS`**, **`MAX_FILE_CHARS`**, **`parseAssistantModelOutput`**, or API contracts.
- **`README.md`**: Overview note that system instructions are compact; file-body context caps unchanged.

### 2026-05-15 — Gemini model fallback chain

- **`server/services/geminiService.js`**: **`GEMINI_MODEL_FALLBACK_CHAIN`** — `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite`, `gemini-2.5-pro`. **`generateContentWithModelFallback`** tries each in order; **`shouldRetryNextModel`** skips further models on **401/403/400**; logs **`console.warn`** on retry/success. Removed single **`MODEL_NAME`** constant.
- **`README.md`**: documents fallback order and retry rules.

### 2026-05-15 — Strip ANSI from Run output (display cleanup)

- **`server/stripAnsi.js`** (new): **`stripAnsi`**, **`sanitizeRunDisplay`** — removes CSI/ESC terminal color and style sequences before the client renders **`output`** / **`error`**.
- **`server/runPython.js`**: all return paths via **`finish()`** → **`sanitizeRunDisplay`**.
- **`server/runCode.js`**: **`sanitizeRunDisplay`** on final **`{ output, error }`**.
- **`server/scripts/test-strip-ansi.mjs`**: assert-based smoke test; **`npm run test:strip-ansi`** in **`server/package.json`**.
- **`README.md`**: §4.5 testing Run output (ANSI cleanup); §5.3 notes stripping on **`POST /run`** response.

### 2026-05-15 — Light and dark UI themes

- **`client/src/theme.js`** (new): **`THEME_STORAGE_KEY`** (`llm:theme:v1`), **`loadTheme`**, **`persistTheme`**, **`applyTheme`** (`data-theme` + `color-scheme` on **`<html>`**), **`monacoThemeForAppTheme`**.
- **`client/src/index.css`**: shared tokens in **`:root`**; full palettes under **`[data-theme="dark"]`** and **`[data-theme="light"]`** (text, surfaces, accent, danger/warn, shadows, hovers, overlays).
- **`client/index.html`**: **`data-theme="dark"`** on **`<html>`** to avoid flash before JS.
- **`client/src/main.jsx`**: **`applyTheme(loadTheme())`** before React render.
- **`client/src/App.jsx`**: **`colorTheme`** state; top bar **Dark** / **Light** toggle; **`useEffect`** persists/applies theme; passes **`colorTheme`** to **`CodeEditor`** and **`AiEditPreviewModal`**.
- **`client/src/components/CodeEditor.jsx`**, **`AiEditPreviewModal.jsx`**: Monaco **`theme`** **`vs-dark`** or **`light`** from **`colorTheme`** prop.
- **`client/src/App.css`**: theme/env segmented controls; hardcoded accent/danger/shadow colors replaced with CSS variables where needed for both themes.
- **`README.md`**: theme toggle, **`llm:theme:v1`**, Monaco pairing, **`theme.js`** in layout table.

### 2026-05-15 — Export ZIP and gist-style snippet copy

- **`client/package.json`**: dependency **`jszip`** for in-browser archive download.
- **`client/src/workspaceSnippet.js`** (new): **`formatGistSnippet`** (`###` title + fenced block with **`javascript`** / **`python`** lang), **`gistSnippetPreviewLine`**, **`markdownLangForWorkspaceFile`**.
- **`client/src/copyToClipboard.js`** (new): **`copyTextToClipboard`** (`navigator.clipboard` + textarea fallback).
- **`client/src/exportWorkspaceZip.js`** (new): **`downloadDualWorkspaceZip`** — zip folders **`javascript/`**, **`python/`**, **`README.txt`**; filename **`llm-workspace-YYYYMMDD-HHMM.zip`**.
- **`client/src/App.jsx`**: top bar **Export ZIP**; editor **Copy snippet** + **gist strip** above Monaco; **`handleCopySnippet`** / **`handleExportZip`**; toast state renamed **`toastMessage`** / **`showToast`** (AI apply + copy/export feedback).
- **`client/src/components/FileExplorer.jsx`**: context menu **Copy gist snippet**; **`onCopySnippet`** prop (per-row icons removed later).
- **`client/src/App.css`**: **`.workspace__share-btn`**, **`.editor-toolbar-btn`**, **`.editor-snippet-strip`**, **`.workspace-toast`** (shared with **`.ai-toast`** styles).
- **`README.md`**: §4 overview + §4.2 export/snippet UX; layout table entries for new modules.

### 2026-05-15 — Chat footer: Gemini model that answered

- **`server/services/geminiService.js`**: **`generateResponse`** returns **`modelId`** and **`modelFallback`** (from **`generateContentWithModelFallback`**).
- **`server/index.js`**: **`POST /chat`** 200 JSON adds **`model`**, **`modelFallback`**, **`modelChain`** (re-exports **`GEMINI_MODEL_FALLBACK_CHAIN`**).
- **`client/src/components/ChatPanel.jsx`**: footer above composer — last **`model`**, **fallback** badge when applicable, full chain with active model highlighted; idle hint before first message.
- **`client/src/App.css`**: **`.chat-panel__footer`** and related styles.
- **`README.md`**: §4.3 footer UX; §5.1 / §5.2 response fields; **`ChatPanel.jsx`** table note.

### 2026-05-15 — Format document (Prettier JS, Black Python)

- **`client/package.json`**: dependency **`prettier`**.
- **`client/src/formatJavaScript.js`** (new): **`formatJavaScript`** (async **`await prettier.format`**) via **`prettier/standalone`** + babel/estree plugins.
- **`server/formatPython.js`** (new): **`formatPythonWithBlack`** — **`spawnSync`** **`black -q -`** (stdin/stdout); **`BLACK_BIN`**, **`FORMAT_PYTHON_TIMEOUT_MS`** env; reuses **`MAX_RUN_CODE_CHARS`**.
- **`server/index.js`**: **`POST /format`** — Python only; JS returns **400** (client Prettier).
- **`server/.env.example`**: **`BLACK_BIN`**, **`FORMAT_PYTHON_TIMEOUT_MS`** documented.
- **`client/vite.config.js`**: proxy **`/format`** → Express.
- **`client/src/App.jsx`**: editor **Format** button; **`handleFormatDocument`** (Prettier in-browser for JS, **`fetch /format`** for Python); undo snapshot before apply; **`formatPending`** state.
- **`README.md`**: overview, §4.2 Format UX, §5.1 route table, §5.3 **`POST /format`** (Run renumbered §5.4).

### 2026-05-15 — Black setup: install + Windows-friendly invocation

- Installed **Black** on dev host via **`py -m pip install black`** (user site-packages; `black.exe` not on PATH).
- **`server/formatPython.js`**: **`getBlackInvocationCandidates`** — tries **`black`**, then **`PYTHON_BIN -m black`**, then **`py -m black`** / **`python -m black`** (platform-specific); **`BLACK_BIN`** supports custom executable or `py -m black`; ENOENT tries next candidate; clearer aggregate error.
- **`server/.env.example`**: install note and **`BLACK_BIN=py -m black`** example.
- **`README.md`**: fallback chain and Windows **`py -m pip install black`** troubleshooting.

### 2026-05-15 — Run UX: duration + error labels

- **`server/runMeta.js`** (new): **`classifyRunError`**, **`buildRunResponse`**, **`timeoutMsForRunEnvironment`** — buckets **timeout**, **recursion**, **syntax**, **runtime**, **config**; labels via **`RUN_ERROR_LABELS`**.
- **`server/index.js`**: **`POST /run`** measures **`durationMs`** with **`performance.now()`**; JSON adds **`timeoutMs`**, **`runStatus`**, **`errorKind`**, **`errorLabel`** (keeps **`output`**, **`error`**).
- **`server/scripts/test-run-error-kind.mjs`**, **`npm run test:run-error-kind`**.
- **`client/src/App.jsx`**: **`runMeta`**, **`runErrorLabel`**; Output header **Running…** / **Completed in N ms** / **Timed out at N ms**; error tag + kind line in body.
- **`client/src/App.css`**: **`.run-output__status`**, **`.run-output__error-tag`**, **`.run-output__error-kind`**.
- **`README.md`**: overview, §4.2, §5.1 / §5.4, layout, troubleshooting.

### 2026-05-15 — Copy raw file (per-file)

- **`client/src/App.jsx`**: **`handleCopyRawFile`** — copies file body only via **`copyTextToClipboard`**; editor **Copy code** button; **`onCopyRaw`** passed to explorer.
- **`client/src/components/FileExplorer.jsx`**: context menu **Copy raw file** (before gist snippet); **`onCopyRaw`** prop (per-row icons removed later).
- **`README.md`**: §4 overview + §4.2 distinguish **Copy code** vs **Copy snippet**.

### 2026-05-15 — Remove editor gist strip

- **`client/src/App.jsx`**: removed **gist strip** bar under editor header (duplicate of **Copy snippet**); gist copy remains in explorer + header.
- **`client/src/workspaceSnippet.js`**: removed unused **`gistSnippetPreviewLine`**.

### 2026-05-15 — New file: empty starter

- **`client/src/App.jsx`**: **`handleCreateFile`** uses **`""`** instead of **`// New file`** / **`# New file`** comment lines.

### 2026-05-15 — Explorer: row icons (rename/delete only)

- **`client/src/components/FileExplorer.jsx`**: per-row icons are **rename** and **delete** only; copy raw / copy gist removed from rows (context menu + editor header).
- **`README.md`**: copy via context menu / header; rename/delete on row + context menu.
- **`client/src/App.css`**: removed **`.editor-snippet-strip`** styles.
- **`README.md`**: dropped gist strip from §4.2 and layout table.
