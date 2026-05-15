This is the system specification and intended behavior of the application.
It describes how the system should work.
For implementation history and changes, see: agent-memory.md

**How this repository was built:** The project was developed using **Cursor** for implementation and coding, and **ChatGPT** plus **Google Gemini** for planning, design discussions, and prompt engineering.

# Workspace documentation

Browser-based **dual-environment workspace** (top bar **JavaScript** vs **Python**): each has its own in-memory files (**`*.js`** or **`*.py`** only), Monaco editor, Run output, undo/redo stacks, and AI chat context. **Google Gemini** chat supports **Chat** / **Agent** modes with tools scoped to the active environment. **Run** uses **`vm2`** for JS and a subprocess for Python. Stack: **Express** (`server/`) + **Vite + React 19** (`client/`).

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
| API | `server/` | Node.js, Express, ESM; **`vm2`** for JS **`POST /run`**; Python **`POST /run`** via subprocess | http://localhost:3001 |
| UI | `client/` | React 19, Vite 6, Monaco, lucide-react | http://localhost:5173 |

**High-level behavior**

- **Dual workspace:** The top bar **JavaScript** / **Python** switch selects **`environment`**: two isolated slices **`{ files, activePath }`**, not shared. Defaults: **`main.js`** (JS) and **`main.py`** (Python). Explorer, editor, Run, and chat only see the active slice. **Undo/redo** is tracked **per environment** (still in-memory only).
- **Persistence:** Both slices plus the selected **`environment`** are saved under **`localStorage`** key **`llm:dualWorkspace:v1`**. A legacy **`llm:workspace:v1`** snapshot (JS-only) is migrated into the JS slice on first load if the dual key is absent. **Reset** restores default JS and Python workspaces and clears both undo stacks.
- **Theme:** Top bar **Dark** / **Light** sets **`data-theme`** on **`<html>`** (CSS variables in **`index.css`**). Choice is persisted under **`localStorage`** key **`llm:theme:v1`**. Monaco uses **`vs-dark`** or **`light`** to match. Default is **dark** if storage is missing or invalid.
- **Export:** Top bar **Export ZIP** downloads **`javascript/`** and **`python/`** folders (all tabs in both workspaces) plus a short **`README.txt`**, built in the browser via **`jszip`**.
- **Gist snippets:** Per-file **gist-style Markdown** (`### filename` + fenced code block) — copy from the editor header (**Copy snippet**), the strip above the editor, explorer row actions, or the file context menu.
- **AI chat:** Every **`POST /chat`** includes **`environment`** (must match the UI) and **`mode`** (**Chat** vs **Agent**). Server validates **`files`** / **`currentFile`** keys as **`*.js`** or **`*.py`** accordingly; Gemini prompts and tool parsing are **environment-scoped** so the model must not emit cross-environment filenames.
- **Run:** **Run** posts **`{ code, environment }`** where **`environment`** is **`"js"`** or **`"python"`** (default **`"js"`**). Legacy body field **`runtime`** is still accepted as a fallback. JS uses **`vm2`**; Python uses **`runPython.js`** (see §5.4).
- **Format:** Editor **Format** — **Prettier** in the browser for **`.js`**; **Black** via server subprocess for **`.py`** (`py -m pip install black` on the host running Express). The server tries **`black`**, then **`py -m black`** / **`python -m black`** (and **`PYTHON_BIN -m black`** if set). Optional **`BLACK_BIN`** overrides (e.g. `py -m black`).

**Gemini:** `@google/generative-ai`, API key: **`GEMINI_API_KEY`**. Chat calls **`generateContent`** with automatic model fallback in **`GEMINI_MODEL_FALLBACK_CHAIN`** (`server/services/geminiService.js`): **`gemini-2.5-flash`** → **`gemini-2.5-flash-lite`** → **`gemini-3-flash-preview`** → **`gemini-3.1-flash-lite`** → **`gemini-2.5-pro`**. On recoverable failures (e.g. model unavailable, 429, 5xx, empty reply), the server tries the next model; **401/403** and **400** do not advance the chain. Prompts use compact section tags; file bodies still respect **`MAX_CONTEXT_CHARS`** / **`MAX_FILE_CHARS`**.

---

## 2. Quick start

**Prerequisites:** Node.js **18+** recommended. **Optional:** Python **3** installed and on **`PATH`** (or **`PYTHON_BIN`** set) if you use the **Python** Run runtime.

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
| `RUN_VM_TIMEOUT_MS` | `1000` | **`environment: "js"`** on **`POST /run`** — wall-clock timeout (ms) for **`vm2`**, clamped **1–60000**; read when `runCode.js` loads (**restart** after change) |
| `RUN_PYTHON_TIMEOUT_MS` | _(falls back to `RUN_VM_TIMEOUT_MS`)_ | **`environment: "python"`** — subprocess wall-clock timeout (ms), clamped **1–60000** |
| `PYTHON_BIN` | `python` on Windows, `python3` elsewhere | **`environment: "python"`** — executable passed to **`spawnSync`** |

**Tracked template:** `server/.env.example` (never commit real secrets).

---

## 4. Using the application

### 4.1 Dual environment (JavaScript vs Python)

- **JavaScript workspace:** Explorer tabs are **only** `*.js` single-segment names (e.g. `main.js`, `untitled-1.js`). **New file:** `untitled-N.js` with starter `// New file\n`. **Rename:** base name + fixed **`.js`** suffix in the UI.
- **Python workspace:** Same rules with **`*.py`** (e.g. `main.py`, `untitled-1.py`), starter **`# New file\n`**, and **`.py`** rename suffix.
- The two workspaces **do not share** `files` or `activePath`. Switching the top bar environment swaps the entire editor + explorer + run context. **Chat** threads reset when you switch (in-memory messages per visit to each environment).
- **Delete:** You cannot delete the **last** file in an environment (a workspace must keep at least one tab).

### 4.2 Editor, export, and Run

- Monaco language follows the **active environment** and file extension (**JavaScript** or **Python**). The editor header shows the active filename, a small **JS** / **Python** badge, **Copy snippet**, **Format**, and **Run**.
- **Format document:** **`.js`** tabs are formatted in the browser with **Prettier** (`client/src/formatJavaScript.js`). **`.py`** tabs call **`POST /format`** with **`environment: "python"`**; the server runs Black on stdin (`black -q -` or `py -m black -q -`, etc.). Formatted text replaces the active tab and is undoable.
- **Gist strip:** A compact bar above the editor previews the fence line (e.g. ` ```javascript  main.js `) and offers **Copy** for the full Markdown block of the active tab.
- **Export ZIP:** **Export ZIP** in the top bar saves both workspace slices (not only the active environment). Filenames are timestamped (`llm-workspace-YYYYMMDD-HHMM.zip`).
- **Run** sends the active tab’s contents with **`environment`** **`"js"`** or **`"python"`** (same value as the workspace switch). Output semantics are unchanged from §5.4 (JS **`console.*`**, Python **stdout** / **stderr**). The API strips **ANSI escape sequences** (terminal color codes) from **`output`** and **`error`** before JSON so the Output panel shows plain text (see §4.5).

### 4.3 AI chat and file proposals

- The chat panel has **Chat** and **Agent** modes (toggle in the header). Every request includes **`mode`**: **`"chat"`** (default) or **`"agent"`**, and **`environment`**: **`"js"`** (default) or **`"python"`** (must match the UI workspace).
- **Chat mode:** The server never parses or applies tool JSON; replies are natural language (Markdown allowed). The client ignores any **`toolCall`** unless **`mode`** and **`environment`** from the server match the request.
- **Agent mode:** The model must return a single valid **`edit_file`** or **`create_file`** JSON object with paths ending in **`.js`** (when **`environment`** is JS) or **`.py`** (when Python). Valid payloads open **`AiEditPreviewModal`**. **Accept** updates only the **current** environment’s `files` / `activePath`.
- Composer sends **`message`**, **`files`**, **`currentFile`**, **`mode`**, and **`environment`** to **`POST /chat`**. A small footer above the composer shows **which model answered** the last reply, highlights it in the fallback chain, and marks **fallback** when a later model was used after an earlier failure.

### 4.5 Testing Run output (ANSI cleanup)

**Automated (server):**

```powershell
cd server
npm run test:strip-ansi
```

**Manual in the UI (Python — typical colored tracebacks):**

1. Switch to **Python**, open `main.py`, paste and **Run**:

```python
def dangerous_recursion(n=0):
    return dangerous_recursion(n + 1)

dangerous_recursion()
```

2. **Expect:** Output **error** shows a normal traceback (`File "<stdin>"`, `RecursionError`, …) with **no** `[35m`, `[0m`, or other escape junk.

**Manual (Python — explicit ANSI in print):**

```python
print("\033[31mred\033[0m plain")
raise RuntimeError("after color")
```

3. **Expect:** `red plain` in **output** (or error text without raw `\033` sequences).

**Manual (API with curl / Invoke-RestMethod):**

```powershell
$body = @{ code = "print(chr(27)+'[31mhi'+chr(27)+'[0m')"; environment = "python" } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3001/run -Method POST -ContentType "application/json" -Body $body
```

4. **Expect:** JSON **`output`** is `hi` (or `hi` plus newline), not containing `[31m`.

**JavaScript:** vm2 errors rarely include ANSI; run `throw new Error("fail")` and confirm the message displays normally.

### 4.4 Workspace state (reference)

| Topic | Behavior |
|-------|----------|
| Storage | `App.jsx` holds **`dualWorkspace`** `{ environment, js: { files, activePath }, python: { files, activePath } }`; persisted via **`workspaceStorage.js`** key **`llm:dualWorkspace:v1`**. |
| Migrate | If **`llm:dualWorkspace:v1`** is missing, a legacy **`llm:workspace:v1`** object (JS-only) hydrates the **JS** slice; **Python** defaults to **`main.py`**. |
| Create | Next free `untitled-N.js` or `untitled-N.py` depending on **`environment`**. |
| Select | Sets **`activePath`** inside the active slice only. |
| Delete | Confirm → remove key (not the last file); pick next active; bump `editorNonce` if needed. |
| Rename | **`workspaceFileValidation.js`** enforces **`*.js`** or **`*.py`** per environment. |
| Editor | `CodeEditor` **`key`** includes **`environment`** so Monaco remounts on environment switch. |
| Undo / redo | Max **40** snapshots **per environment**; each snapshot is `{ files, activePath }` for that slice only. |

Chat request flow:

```mermaid
sequenceDiagram
  participant UI as ChatPanel
  participant Vite as Vite dev server
  participant API as Express /chat
  participant Gemini as Gemini API
  UI->>Vite: POST /chat (body includes mode + environment)
  Vite->>API: proxy :3001/chat
  API->>Gemini: generateContent (prompt per mode + environment)
  Gemini-->>API: text
  API-->>UI: 200 response + toolCall + mode + environment
  UI->>UI: diff modal then merge or reject
```

---

## 5. API reference

### 5.1 Route index

| Method | Path | Success body (shape) |
|--------|------|----------------------|
| GET | `/api/health` | `{ ok, service, timestamp }` |
| GET | `/api/hello` | `{ message }` |
| POST | `/chat` | `{ response, toolCall, mode, environment, model, modelFallback, modelChain }` — see §5.2 |
| POST | `/run` | `{ output, error }` from **`code`** + **`environment`** (legacy **`runtime`** accepted) |
| POST | `/format` | `{ code, error }` — Python only (**Black**); JS is formatted in the browser |

### 5.2 `POST /chat`

- **URLs:** `http://localhost:5173/chat` (proxied) or `http://localhost:3001/chat`
- **Headers:** `Content-Type: application/json` (body limit **4 MB**)
- **Body:** `message` (string, required). Optional **`files`** (≤200 keys), **`currentFile`** (string \| null), **`mode`** (`"chat"` \| `"agent"`, default **`"chat"`**), **`environment`** (`"js"` \| `"python"`, default **`"js"`**). Keys in **`files`** and **`currentFile`** must match the environment: **`*.js`** when **`environment`** is JS, **`*.py`** when Python (`parseChatContext` + `workspaceFileValidation.js`).
- **200:** `response`, `toolCall`, **`mode`**, and **`environment`** (each echoing normalized server values). Also **`model`** (Gemini model id that produced the reply), **`modelFallback`** (`true` when a model after the first in the chain succeeded), and **`modelChain`** (ordered list of model ids — same as **`GEMINI_MODEL_FALLBACK_CHAIN`** in `geminiService.js`).
- **Chat mode:** The server does not run structured-output parsing for tools; the model is instructed not to emit **`edit_file`** / **`create_file`** JSON.
- **Agent mode:** The server parses model text with `assistantOutput.js`; a reply without a valid tool payload is an error (**502** with `Gemini API error` / detail text).
- **Errors:** JSON with `error` and usually `detail`; typical statuses **400**, **401/403**, **429**, **500**, **502** (see prior README behavior — missing key, rate limits, upstream failures).

### 5.3 `POST /format`

- **URLs:** `http://localhost:5173/format` (proxied) or `http://localhost:3001/format`
- **Body:** **`code`** (string, required). **`environment`**: use **`"python"`** for Black formatting. **`"js"`** returns **400** (JavaScript uses client-side Prettier). Legacy **`runtime`** is accepted like **`POST /run`**. Same max length as Run (**`MAX_RUN_CODE_CHARS`**).
- **200:** **`{ code, error }`**. On success **`error`** is empty and **`code`** is the formatted source. On formatter failure **`code`** may be empty and **`error`** explains (e.g. Black not installed, syntax error).
- **Requires:** [Black](https://black.readthedocs.io/) on the server host — e.g. **`py -m pip install black`** (Windows) or **`pip install black`**. If the `black` script is not on PATH, the server falls back to **`py -m black`** / **`python -m black`**. Override with **`BLACK_BIN`** (executable or `py -m black`). Optional **`FORMAT_PYTHON_TIMEOUT_MS`** (default **15000**, max **60000**).

### 5.4 `POST /run`

- **URLs:** `http://localhost:5173/run` (proxied) or `http://localhost:3001/run`
- **Body:** **`code`** (string, required). Optional **`environment`**: **`"js"`** \| **`"python"`** (default **`"js"`**). Legacy **`runtime`** is read if **`environment`** is omitted (same normalization). Max **`MAX_RUN_CODE_CHARS`** applies to **`code`**.
- **200:** **`{ output, error }`** (same shape). **`output`** and **`error`** are passed through **`stripAnsi`** (`server/stripAnsi.js`) so ANSI color codes from Python tracebacks (and similar) do not appear in the UI. **`error`** may be non-empty on HTTP 200 (e.g. Python **`stderr`**, or JS exception after **`console`** capture).
- **`environment: "js"`** (default): **`executeJavaScript`** in **`runCode.js`** — unchanged **`vm2`** sandbox (stub **`console`** only; **`eval`**, **`wasm`**, async disabled; **`RUN_TIMEOUT_MS`** from **`RUN_VM_TIMEOUT_MS`**).
- **`environment: "python"`**: **`executePython`** in **`runPython.js`** — subprocess (**`-I -u -`**, script on stdin). **Not** a JS-class sandbox.
- **400 / 500:** Same JSON **`{ output, error }`** shapes as today where applicable.

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
│   ├── runPython.js
│   ├── formatPython.js
│   ├── stripAnsi.js
│   ├── scripts/
│   │   └── test-strip-ansi.mjs
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
        ├── formatJavaScript.js
        └── components/
            ├── FileExplorer.jsx
            ├── CodeEditor.jsx
            ├── ChatPanel.jsx
            └── AiEditPreviewModal.jsx
```

**Key client files**

| File | Role |
|------|------|
| `App.jsx` | Dual **`environment`**, two workspace slices, per-env undo/redo, Run/Format/output, AI diff + toast, theme toggle |
| `formatJavaScript.js` | Prettier format for **`.js`** in the browser |
| `theme.js` | **`loadTheme`** / **`persistTheme`** / **`applyTheme`**; key **`llm:theme:v1`** |
| `workspaceSnippet.js` | **`formatGistSnippet`**, **`gistSnippetPreviewLine`** — Markdown blocks for clipboard |
| `exportWorkspaceZip.js` | **`downloadDualWorkspaceZip`** — browser ZIP via **`jszip`** |
| `copyToClipboard.js` | **`copyTextToClipboard`** |
| `workspaceFilename.js` / `workspaceFileValidation.js` | Path policy and validators |
| `workspaceStorage.js` | Dual-workspace **`localStorage`** (`llm:dualWorkspace:v1`), legacy **`llm:workspace:v1`** migration |
| `FileExplorer.jsx` | List, new file, rename (**.js** / **.py** suffix UI per environment), delete |
| `CodeEditor.jsx` | Monaco; **`key`** includes **`environment`** |
| `ChatPanel.jsx` | Thread + `POST /chat`; footer shows **`model`** / **`modelChain`** from the server |
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
- **Python `POST /run`** uses a normal OS subprocess with **`-I`** (no user **`site-packages`**) but **full CPython** still has **`import os`**, sockets, and file access unless you add OS-level containment. **Do not** expose this endpoint to untrusted networks without additional hardening.
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
| `POST /run` 400 | Bad **`code`** type, over max length, or malformed JSON |
| `POST /run` timeout / killed | **JS:** exceeded **`RUN_TIMEOUT_MS`** — shorten work or raise **`RUN_VM_TIMEOUT_MS`** and restart. **Python:** exceeded **`RUN_PYTHON_TIMEOUT_MS`** (or VM fallback) — same idea. |
| `POST /run` async / eval issues (**JS** only) | **`allowAsync: false`**, **`eval: false`** — use simple synchronous scripts |
| `POST /run` “Python not found” | **Python** runtime: interpreter missing or wrong **`PYTHON_BIN`** |
| Format toast “Black not found” | On the server host: `py -m pip install black` (or `pip install black`). Restart **`npm run dev`**. Optional **`BLACK_BIN=py -m black`** in **`server/.env`** |
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
| Run (JS + Python) | `server/runCode.js`, `server/runPython.js`, `server/stripAnsi.js`, `server/index.js`, `client/vite.config.js`, `App.jsx`, `App.css` |
| Format (Prettier + Black) | `client/src/formatJavaScript.js`, `server/formatPython.js`, `server/index.js` (`POST /format`), `App.jsx`, `vite.config.js` |
| UI / Monaco | `App.css`, `index.css`, `CodeEditor.jsx`, `vite.config.js`, `index.html`, `public/favicon.svg` |

Record **factual implementation changes** in [`agent-memory.md`](./agent-memory.md) (append-only).
