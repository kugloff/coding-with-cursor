This is the system specification and intended behavior of the application.
It describes how the system should work.
For implementation history and changes, see: agent-memory.md

# Workspace documentation

Browser-based **JavaScript workspace** (Monaco editor, in-memory `.js` files), **Google Gemini** chat with optional **`edit_file`** / **`create_file`** proposals, and **sandboxed** server-side **Run** for the active file. Stack: **Express** (`server/`) + **Vite + React 19** (`client/`).

**Implementation history (append-only, factual):** [`agent-memory.md`](./agent-memory.md) — update **this** file when **behavior or spec** changes; append **`agent-memory.md`** only for **code** changes; do not duplicate the same detail in both (prefer **`agent-memory.md`** for implementation detail when unsure).

---

## Table of contents

1. [Overview](#1-overview)  
2. [Quick start](#2-quick-start)  
3. [Configuration](#3-configuration)  
4. [Using the application](#4-using-the-application)  
5. [API reference](#5-api-reference)  
6. [Project layout](#6-project-layout)  
7. [Build and deployment notes](#7-build-and-deployment-notes)  
8. [Security and limitations](#8-security-and-limitations)  
9. [Troubleshooting](#9-troubleshooting)  
10. [For contributors and AI assistants](#10-for-contributors-and-ai-assistants)

---

## 1. Overview

| Part | Path | Stack | Default URL |
|------|------|-------|----------------|
| API | `server/` | Node.js, Express, ESM, **vm2** for `POST /run` | http://localhost:3001 |
| UI | `client/` | React 19, Vite 6, Monaco, lucide-react | http://localhost:5173 |

**High-level behavior**

- **Explorer + Monaco:** Cursor-inspired dark UI; **`files`** and **`activePath`** live in React state as the source of truth and are **mirrored to `localStorage`** in the browser so a refresh restores the last workspace (or defaults if nothing valid is stored).
- **AI chat:** Sends workspace context to **`POST /chat`** with a UI-selected **`mode`**: **Chat** (natural language only; no structured tools) or **Agent** (structured **`edit_file`** / **`create_file`** only) → diff modal → accept/reject when in Agent mode.
- **Run:** Sends active **`.js`** buffer to **`POST /run`**; output and errors shown under the editor (panel can be minimized).

**Gemini:** `@google/generative-ai`, model name in **`MODEL_NAME`** inside `server/services/geminiService.js` (e.g. **`gemini-2.5-flash`**). API key: **`GEMINI_API_KEY`**.

---

## 2. Quick start

**Prerequisites:** Node.js **18+** recommended.

From the **repository root**:

```powershell
npm run install:all
```

Copy **`server/.env.example`** → **`server/.env`** and set **`GEMINI_API_KEY`**.

**Run both apps:**

```powershell
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:3001  
- In dev, the UI calls **`/api/*`**, **`/chat`**, **`/run`** on the Vite origin; **`client/vite.config.js`** proxies those to Express.

**API only or UI only:**

```powershell
npm run dev:server
npm run dev:client
```

---

## 3. Configuration

Set variables in **`server/.env`** or the process environment. **`server/index.js`** imports **`./env.js`** first so `.env` is loaded before other server modules (including run timeout).

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | API listen port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allowed origin |
| `GEMINI_API_KEY` | _(required for chat)_ | Gemini API key |
| `RUN_VM_TIMEOUT_MS` | `1000` | `POST /run` wall-clock timeout (ms), clamped **1–60000**; read when `runCode.js` loads (**restart** after change) |

**Tracked template:** `server/.env.example` (never commit real secrets).

---

## 4. Using the application

### 4.1 Virtual workspace (JavaScript-only)

- Explorer tabs are **only** `*.js` single-segment names (e.g. `main.js`, `untitled-1.js`). This is **not** the same as repo UI files (those may use `.jsx` for React).
- **New file:** `untitled-N.js` with starter `// New file\n`.
- **Rename:** Edit the **base name** only; a fixed **`.js`** suffix is shown; any typed extension is normalized away.
- **Persistence:** On each workspace change, the app writes **`files`** and **`activePath`** to **`localStorage`** (key `llm:workspace:v1`). On load, that snapshot is restored if it parses and passes workspace path rules; otherwise built-in **`DEFAULT_FILES`** / **`main.js`** are used. **Undo/redo stacks are not persisted** (in-memory only per session).
- **Reset:** Top bar **Reset** clears the storage key, restores default files, clears undo/redo, and bumps the editor so Monaco reloads.
- **Delete / Undo / Redo:** As in the workspace table below.

### 4.2 Editor and Run

- Monaco language mode is **JavaScript** for valid workspace paths.
- **Run** (header): posts current file text to **`POST /run`**; **Output** shows captured **`console.*`** and errors. **Output** can be **minimized** with the header chevron; **Run** re-expands the panel.

### 4.3 AI chat and file proposals

- The chat panel has **Chat** and **Agent** modes (toggle in the header). Every request includes **`mode`**: **`"chat"`** (default) or **`"agent"`**.
- **Chat mode:** The server never parses or applies tool JSON; replies are natural language (Markdown allowed). The client ignores any **`toolCall`** field for defense in depth.
- **Agent mode:** The model must return a single valid **`edit_file`** or **`create_file`** JSON object (no conversational wrapper). Valid payloads open **`AiEditPreviewModal`** (Monaco diff). **Accept** updates `files`, **`activePath`**, **`editorNonce`**, and shows a toast. **Reject** / **Escape** discards. Invalid or non-tool output returns an API error.
- Composer sends **`message`**, full **`files`** map, **`currentFile`**, and **`mode`** to **`POST /chat`**.

### 4.4 Workspace state (reference)

| Topic | Behavior |
|-------|----------|
| Storage | `useState` in `App.jsx` (`files`, `activePath`); mirrored to **`localStorage`** on change; hydrated on startup via `workspaceStorage.js`. |
| Create | Next free `untitled-N.js`. |
| Select | Sets `activePath`; explorer uses `aria-current` on active row. |
| Delete | Confirm → remove key; pick next active or `null`; bump `editorNonce` if needed. |
| Rename | Validators ensure `.js`, no dupes; `handleRenameFile` / `FileExplorer` use `workspaceFileValidation.js`. |
| Editor | `value` = `files[activePath]`; `onChange` writes back live. |
| Remount | `CodeEditor` `key` includes `editorNonce` after structural changes. |
| Undo / redo | Max **40** snapshots per stack; `{ files, activePath }` shallow clone; typing burst groups one undo entry; redo cleared on new capture. |

Chat request flow:

```mermaid
sequenceDiagram
  participant UI as ChatPanel
  participant Vite as Vite dev server
  participant API as Express /chat
  participant Gemini as Gemini API
  UI->>Vite: POST /chat (body includes mode)
  Vite->>API: proxy :3001/chat
  API->>Gemini: generateContent (prompt per mode)
  Gemini-->>API: text
  API-->>UI: 200 response + toolCall + mode
  UI->>UI: diff modal then merge or reject
```

---

## 5. API reference

### 5.1 Route index

| Method | Path | Success body (shape) |
|--------|------|----------------------|
| GET | `/api/health` | `{ ok, service, timestamp }` |
| GET | `/api/hello` | `{ message }` |
| POST | `/chat` | `{ response: string, toolCall: null \| { action, filename, content }, mode: "chat" \| "agent" }` |
| POST | `/run` | `{ output: string, error: string }` |

### 5.2 `POST /chat`

- **URLs:** `http://localhost:5173/chat` (proxied) or `http://localhost:3001/chat`
- **Headers:** `Content-Type: application/json` (body limit **4 MB**)
- **Body:** `message` (string, required). Optional `files` (≤200 keys, string→string), `currentFile` (string or null), **`mode`** (`"chat"` \| `"agent"`, default **`"chat"`**). Every **`files`** key and non-null **`currentFile`** must be a valid **`*.js`** workspace name (`parseChatContext` + `workspaceFileValidation.js`).
- **200:** `response` (natural language in **Chat**; empty string when a valid tool is returned in **Agent**), `toolCall` (**always `null`** in **Chat**; in **Agent**, a validated **`edit_file`** / **`create_file`** object on success), and **`mode`** echoing the normalized value the server used (`normalizeChatMode` in `chatBody.js`).
- **Chat mode:** The server does not run structured-output parsing for tools; the model is instructed not to emit **`edit_file`** / **`create_file`** JSON.
- **Agent mode:** The server parses model text with `assistantOutput.js`; a reply without a valid tool payload is an error (**502** with `Gemini API error` / detail text).
- **Errors:** JSON with `error` and usually `detail`; typical statuses **400**, **401/403**, **429**, **500**, **502** (see prior README behavior — missing key, rate limits, upstream failures).

### 5.3 `POST /run`

- **URLs:** `http://localhost:5173/run` (proxied) or `http://localhost:3001/run`
- **Body:** `{ "code": string }` — max **`MAX_RUN_CODE_CHARS`** (500 000 in `runCode.js`).
- **200:** `{ output, error }`. Code runs in **`vm2`** `VM` with **only** stub **`console`**; no **`require`**, **`process`**, **`fs`**, or network in the sandbox; **`eval: false`**, **`wasm: false`**, **`allowAsync: false`**; **`bufferAllocLimit`** 1 MiB; timeout **`RUN_TIMEOUT_MS`** (default **1000** ms).
- **400 / 500:** Documented `{ output, error }` shapes where applicable.

---

## 6. Project layout

```
.
├── agent-memory.md       # Append-only implementation changelog (see top of README)
├── package.json
├── README.md
├── server/
│   ├── index.js
│   ├── env.js
│   ├── chatBody.js
│   ├── assistantOutput.js
│   ├── workspaceFilename.js
│   ├── workspaceFileValidation.js
│   ├── runCode.js
│   ├── .env.example
│   └── services/
│       └── geminiService.js
└── client/
    ├── vite.config.js
    ├── index.html
    ├── public/favicon.svg
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── App.css
        ├── index.css
        ├── workspaceFilename.js
        ├── workspaceFileValidation.js
        ├── workspaceStorage.js
        └── components/
            ├── FileExplorer.jsx
            ├── CodeEditor.jsx
            ├── ChatPanel.jsx
            └── AiEditPreviewModal.jsx
```

**Key client files**

| File | Role |
|------|------|
| `App.jsx` | Workspace, undo/redo, Run/output, AI diff + toast, validation hooks |
| `workspaceFilename.js` / `workspaceFileValidation.js` | Path policy and validators |
| `workspaceStorage.js` | `localStorage` load / save / clear for `{ files, activePath }` |
| `FileExplorer.jsx` | List, new file, rename (with `.js` suffix UI), delete, context menu |
| `CodeEditor.jsx` | Monaco instance |
| `ChatPanel.jsx` | Thread + `POST /chat` |
| `AiEditPreviewModal.jsx` | Diff editor + accept/reject |

**Notable client deps:** `lucide-react`, `@monaco-editor/react`, `monaco-editor`, `vite-plugin-monaco-editor` (Monaco workers; use `default` export interop in `vite.config.js`).

---

## 7. Build and deployment notes

**Client build (from `client/` or root per your scripts):**

```powershell
npm run build
```

Output: **`client/dist/`**, including **`monacoeditorwork/`** for workers — deploy with same relative URL layout as `index.html`.

**API production:** `npm start` in `server/` runs `index.js` (no watch). Serving **`client/dist`** from Express is **not** wired in this repo yet.

**Vite preview / static hosting:** Proxy **`/chat`** and **`/run`** to the API, or use absolute API URLs — the client uses relative **`/chat`** and **`/run`**.

**Layout tokens:** Explorer width `--width-explorer` (244px), chat `--width-chat` (384px). **Accessibility:** chat log `role="log"`, `aria-live="polite"`; hidden label on chat input.

---

## 8. Security and limitations

- **`vm2` is unmaintained**; sandbox settings reduce accidental Node access and dynamic code paths but are **not** a guarantee against determined attackers. Use separate processes/containers for hostile or production execution.
- **Workspace data** in the browser is stored in **`localStorage`** (same-origin); treat tab contents as sensitive if you paste secrets. **Reset** or private browsing limits retention; there is no server-side file store unless you add one.
- **Gemini** key must stay out of git; use **`server/.env`**.

---

## 9. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| “Could not reach API” / fetch errors | API down or wrong port / proxy |
| CORS errors | `CLIENT_ORIGIN` mismatch with actual UI origin |
| `npm run dev` fails | Run `npm run install:all` from root |
| `POST /chat` 500 “Server configuration” | Missing `GEMINI_API_KEY` |
| `POST /chat` 401/403 | Bad or disabled API key |
| `POST /chat` 400 “files” | Invalid `files` / `currentFile` or non-`*.js` keys |
| `POST /chat` 502 / “Agent mode: expected…” | **Agent** mode: model output was not exactly one valid **`edit_file`** / **`create_file`** JSON object |
| `POST /run` 400 | Bad `code` type or over max length |
| `POST /run` timeout message | Exceeded `RUN_TIMEOUT_MS` — shorten sync work or raise `RUN_VM_TIMEOUT_MS` and restart |
| `POST /run` async / eval issues | `allowAsync: false`, `eval: false` — use simple synchronous scripts |
| Run disabled | No active `.js` tab |
| Rename blocked | Invalid base name, separators, or duplicate after normalization |
| Output “gone” | Output panel minimized — expand via chevron or Run |
| Monaco workers 404 in prod | Ship `monacoeditorwork` with `dist` |
| Workspace not restored after refresh | Corrupt or cleared `localStorage`, private mode, or quota — falls back to defaults; use **Reset** to force defaults |
| Files “missing” after refresh | Rare parse/validation failure on stored JSON — defaults apply; check browser storage for key `llm:workspace:v1` |

---

## 10. For contributors and AI assistants

When requesting changes, specify: **which side** (`server` / `client` / both), **goal**, **API contract** (method, path, body, responses), **env** and secrets handling, **ports** (align CORS + Vite proxy), and any **Gemini** / **Monaco** constraints.

**Touch points by feature**

| Area | Typical files |
|------|----------------|
| Chat / Gemini | `server/services/geminiService.js`, `assistantOutput.js`, `chatBody.js`, `ChatPanel.jsx`, `App.jsx` |
| Workspace paths / validation | `workspaceFilename.js`, `workspaceFileValidation.js` (client + server), `FileExplorer.jsx`, `App.jsx` |
| Browser workspace persistence | `workspaceStorage.js`, `App.jsx` (persist effect, **Reset**), `App.css` (reset button) |
| Run sandbox | `server/runCode.js`, `server/index.js`, `client/vite.config.js`, `App.jsx`, `App.css` |
| UI / Monaco | `App.css`, `index.css`, `CodeEditor.jsx`, `vite.config.js`, `index.html`, `public/favicon.svg` |

Record **factual implementation changes** in [`agent-memory.md`](./agent-memory.md) (append-only).
