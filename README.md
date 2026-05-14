# Fullstack project (Express + Vite React)

This repo is a small **JavaScript** (no TypeScript) fullstack setup:

| Part   | Path      | Stack                          | Default URL              |
|--------|-----------|--------------------------------|--------------------------|
| API    | `server/` | Node.js, Express, ES modules  | http://localhost:3001    |
| UI     | `client/` | React 19, Vite 6, Monaco Editor | http://localhost:5173    |

**Frontend UI:** three-column **dark** workspace — **Explorer** (placeholder tree), **Monaco** editor (`vs-dark`, JavaScript), **Chat** (calls `POST /chat` via Vite proxy). Implemented under `client/src/` with `@monaco-editor/react` and `vite-plugin-monaco-editor` (see [Frontend (client)](#frontend-client)).

**Google Gemini (server):** chat is implemented in `server/services/geminiService.js` using `@google/generative-ai` and model **`gemini-1.5-flash`**. The API key is read from **`GEMINI_API_KEY`** (never commit the real key).

---

## What I (the agent) need for future tasks

When you ask for changes, it helps to specify:

1. **Which side** — `server`, `client`, or both.
2. **Goal** — feature, bug, refactor, or deployment target.
3. **API contract** — if adding endpoints: method, path, request/response shape, auth.
4. **Env** — Node version if not default LTS; any secrets via `.env` (never commit real secrets).
5. **Ports** — if you change `3001` / `5173`, say so (CORS + Vite proxy must stay aligned).
6. **Gemini** — for chat or model changes: confirm `GEMINI_API_KEY` in the server environment and desired model name (default `gemini-1.5-flash` in `server/services/geminiService.js`).
7. **Monaco / layout** — if changing the editor: `client/src/components/CodeEditor.jsx`, `vite.config.js` (Monaco plugin), and `App.css` (pane widths `--width-explorer`, `--width-chat`).

---

## Prerequisites

- **Node.js** 18+ recommended (Express + Vite 6; `--watch` on the server needs a recent Node).

---

## First-time setup

From the **repository root** (`llm/`):

```powershell
npm install
npm install --prefix server
npm install --prefix client
```

Or one shot:

```powershell
npm run install:all
```

---

## Development (both apps)

From the **repository root**:

```powershell
npm run dev
```

This runs **Express** and **Vite** together via `concurrently`.

- Open the UI: http://localhost:5173  
- API base (direct): http://localhost:3001  
- In dev, the browser can call **`/api/...`** and **`POST /chat`** on the Vite dev server; Vite **proxies** those paths to Express (see `client/vite.config.js`).

**Gemini:** set `GEMINI_API_KEY` before `npm run dev` / `npm run dev:server` (see [Environment variables](#environment-variables)).

**Chat in the UI:** the right-hand panel sends messages to **`POST /chat`** (proxied in dev). The server must be running with a valid `GEMINI_API_KEY`, or the panel will show the error returned by the API.

### Run one side only

```powershell
npm run dev:server
npm run dev:client
```

---

## Production-ish flow

1. Build the client:

   ```powershell
   npm run build
   ```

   Output: `client/dist/`

2. Start the API (no hot reload):

   ```powershell
   npm start
   ```

Serving the built SPA from Express is **not** wired yet; say if you want `express.static` for `client/dist` and a catch-all for SPA routing.

**Monaco production build:** `npm run build` emits worker bundles under **`client/dist/monacoeditorwork/`** (path controlled by `vite-plugin-monaco-editor`). If you deploy only `client/dist`, include that folder and keep the same URL structure relative to `index.html`.

---

## Frontend (client)

| Piece | Role |
|--------|------|
| `src/App.jsx` | Top bar + three-pane shell; holds editor document state |
| `src/components/FileExplorer.jsx` | **Placeholder** explorer (static rows); replace with real file tree later |
| `src/components/CodeEditor.jsx` | **Monaco** via `@monaco-editor/react` — theme `vs-dark`, language `javascript` (prop) |
| `src/components/ChatPanel.jsx` | Scrollable messages + textarea; **`fetch("/chat", { method: "POST", body: JSON.stringify({ message }) })`** |
| `src/App.css` | Layout, panes, explorer, chat, tokens referenced from `index.css` |
| `src/index.css` | Global **dark** tokens (`--bg-*`, `--text-*`, `--accent`, pane widths) |

**Dependencies (notable):**

- `@monaco-editor/react` — React wrapper for Monaco
- `monaco-editor` — editor engine (peer to the wrapper)
- `vite-plugin-monaco-editor` (**devDependency**) — wires Monaco workers for Vite; in `vite.config.js` the plugin is loaded with **`monacoEditorModule.default ?? monacoEditorModule`** because the package is CJS and Vite’s ESM interop may not expose `default` as a callable.

**Layout:** fixed left width (`--width-explorer`: 232px), flexible center editor, fixed right width (`--width-chat`: 340px), full viewport height. **Accessibility:** chat input has a visually hidden label; message list uses `role="log"` / `aria-live="polite"`.

---

## Environment variables

| Variable          | Where   | Default                 | Purpose                                      |
|-------------------|---------|-------------------------|----------------------------------------------|
| `PORT`            | server  | `3001`                  | API listen port                              |
| `CLIENT_ORIGIN`   | server  | `http://localhost:5173` | CORS allowed origin                          |
| `GEMINI_API_KEY`  | server  | _(none — required for chat)_ | Google AI Studio / Gemini API key       |

Example (PowerShell):

```powershell
$env:PORT = "4000"; $env:CLIENT_ORIGIN = "http://localhost:5173"; npm run dev:server
```

Chat with Gemini (same session; key is not saved to disk by this sample):

```powershell
$env:GEMINI_API_KEY = "<your-key>"; npm run dev:server
```

If you change the Vite port, set `CLIENT_ORIGIN` to match.

---

## API routes (current)

| Method | Path           | Response example                                      |
|--------|----------------|-------------------------------------------------------|
| GET    | `/api/health`  | `{ "ok": true, "service": "express", "timestamp": … }` |
| GET    | `/api/hello`   | `{ "message": "Hello from the Express API" }`       |
| POST   | `/chat`        | Success: `{ "response": "<model text>" }` — see below |

### `POST /chat` (Gemini)

- **URL (via Vite dev server):** `http://localhost:5173/chat` (proxied to Express).  
- **URL (direct to API):** `http://localhost:3001/chat`
- **Headers:** `Content-Type: application/json`
- **Body:** `{ "message": "<string>" }` — `message` must be a non-empty string after trimming.
- **Success (200):** `{ "response": "<string>" }` — assistant text only.

**Error responses (JSON):** failures return an object with at least `error` and usually `detail` (human-readable). Status codes include:

| Status | When |
|--------|------|
| `400`  | Missing/invalid `message` in body |
| `401` / `403` | Upstream rejected the key or permission (mapped from Gemini client when detectable) |
| `429`  | Rate limited by Gemini |
| `500`  | Missing `GEMINI_API_KEY`, or unexpected server error |
| `502`  | Upstream Gemini failure / empty model output when not classified otherwise |

The Express app uses **`express.json()`**, **CORS** (`CLIENT_ORIGIN`), and delegates generation to **`generateResponse(message)`** in `server/services/geminiService.js` (`@google/generative-ai`, model **`gemini-1.5-flash`**).

---

## Folder layout

```
.
├── package.json          # root scripts + concurrently
├── README.md             # this file
├── server/
│   ├── package.json
│   ├── index.js          # Express entry (JSON body, CORS, routes)
│   └── services/
│       └── geminiService.js   # generateResponse(message) → Gemini text
└── client/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── App.css
        ├── index.css
        └── components/
            ├── FileExplorer.jsx
            ├── CodeEditor.jsx
            └── ChatPanel.jsx
```

---

## Notes for agents / maintainers

- **Language:** `.js` / `.jsx` only; no `tsconfig` or TS deps by design.
- **Server module format:** `"type": "module"` in `server/package.json` → use `import`/`export` in `index.js`.
- **CORS:** Restricted to `CLIENT_ORIGIN` in dev; extend or use a list if you add more origins.
- **Proxy:** During `vite` dev, `/api` and `/chat` are proxied to the Express port (`client/vite.config.js`).
- **Monaco:** `vite.config.js` registers `vite-plugin-monaco-editor` **after** `@vitejs/plugin-react` so workers build and copy to `dist/monacoeditorwork/` on production builds.

---

## Troubleshooting

| Symptom                         | Likely cause                                      |
|---------------------------------|---------------------------------------------------|
| UI shows “Could not reach API” | Server not running, or wrong proxy/port          |
| CORS errors in browser          | `CLIENT_ORIGIN` does not match actual Vite URL   |
| `npm run dev` fails             | Run `npm run install:all` from root first        |
| `POST /chat` → 500 “Server configuration error” | `GEMINI_API_KEY` not set or empty in the server environment |
| `POST /chat` → 401/403 from API | Invalid or revoked API key, or API not enabled for the project |
| `POST /chat` → 429 | Gemini rate limit; retry later |
| Monaco workers 404 after deploy | Ensure `monacoeditorwork` from `client/dist` is deployed next to assets / same base path |
| `monacoEditorPlugin is not a function` (build) | Use `default` export from `vite-plugin-monaco-editor` in `vite.config.js` (already applied in this repo) |
