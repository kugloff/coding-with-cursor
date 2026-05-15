import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowUp, Languages, Sparkles, User } from "lucide-react";
import {
  buildConvertedFilename,
  getTranslationTargets,
  WORKSPACE_ENVIRONMENTS,
} from "@shared/workspaceEnvironments.js";
import { isValidWorkspaceFilename } from "@shared/workspaceFilename.js";

function validToolNameChecker(envId) {
  return (name) => isValidWorkspaceFilename(name, envId);
}

export default function ChatPanel({
  environment = "js",
  files = {},
  targetFilesByEnv = {},
  currentFile = null,
  onAiEditProposal,
  diffPreviewOpen = false,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatMode, setChatMode] = useState("chat");
  const [translateTarget, setTranslateTarget] = useState(() => getTranslationTargets(environment)[0]?.id ?? "python");
  const [pending, setPending] = useState(false);
  const [lastModelInfo, setLastModelInfo] = useState(null);
  const listRef = useRef(null);
  const messageIdRef = useRef(0);

  const translationTargets = useMemo(() => getTranslationTargets(environment), [environment]);

  useEffect(() => {
    const allowed = translationTargets.map((t) => t.id);
    if (allowed.length && !allowed.includes(translateTarget)) {
      setTranslateTarget(allowed[0]);
    }
  }, [translationTargets, translateTarget]);

  useEffect(() => {
    setMessages([]);
    setInput("");
    setLastModelInfo(null);
  }, [environment]);

  const appendMessage = useCallback((role, text) => {
    messageIdRef.current += 1;
    const id = messageIdRef.current;
    setMessages((m) => [...m, { id, role, text }]);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  const canTranslate = Boolean(currentFile && typeof files[currentFile] === "string");

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    const isTranslate = chatMode === "translate";
    if ((!text && !isTranslate) || pending || diffPreviewOpen) return;
    if (isTranslate && !canTranslate) return;

    setInput("");
    const displayText =
      text ||
      (isTranslate
        ? `Translate \`${currentFile}\` to ${WORKSPACE_ENVIRONMENTS[translateTarget]?.lang ?? translateTarget}`
        : "");
    appendMessage("user", displayText);
    setPending(true);

    try {
      const targetFiles = targetFilesByEnv[translateTarget] ?? {};
      const expectedFilename =
        isTranslate && currentFile
          ? buildConvertedFilename(currentFile, environment, translateTarget, targetFiles)
          : undefined;

      const payload = {
        message: text || (isTranslate ? displayText : ""),
        files,
        currentFile: currentFile ?? null,
        mode: chatMode,
        environment,
        ...(isTranslate
          ? {
              targetEnvironment: translateTarget,
              expectedFilename,
              targetFiles,
            }
          : {}),
      };

      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data = {};
      const raw = await res.text();
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(raw.slice(0, 200) || `HTTP ${res.status}`);
        }
      }

      if (!res.ok) {
        const detail = typeof data.detail === "string" ? data.detail : null;
        const errLabel = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
        throw new Error(detail || errLabel);
      }

      if (typeof data.response !== "string") {
        throw new Error("Invalid response from server (response must be a string)");
      }

      const serverMode =
        data.mode === "translate" ? "translate" : data.mode === "agent" ? "agent" : "chat";
      const serverEnvironment = data.environment === "python" ? "python" : "js";
      const serverTarget =
        data.targetEnvironment === "python" ? "python" : data.targetEnvironment === "js" ? "js" : null;

      const allowAgentTools = serverMode === "agent" && serverEnvironment === environment;
      const allowTranslateTools =
        serverMode === "translate" &&
        serverEnvironment === environment &&
        serverTarget === translateTarget &&
        serverTarget !== environment;

      const allowStructuredTools = allowAgentTools || allowTranslateTools;
      const toolEnv = allowTranslateTools ? serverTarget : environment;
      const validToolName = validToolNameChecker(toolEnv);

      const tool = data.toolCall;

      const isEditTool =
        tool &&
        typeof tool === "object" &&
        tool.action === "edit_file" &&
        typeof tool.filename === "string" &&
        validToolName(tool.filename) &&
        typeof tool.content === "string";

      const isCreateTool =
        tool &&
        typeof tool === "object" &&
        tool.action === "create_file" &&
        typeof tool.filename === "string" &&
        validToolName(tool.filename) &&
        typeof tool.content === "string";

      const isFileProposal = isEditTool || isCreateTool;
      const isStructuredProposal = allowStructuredTools && isFileProposal;

      if (isStructuredProposal) {
        onAiEditProposal?.(tool, {
          targetEnvironment: toolEnv,
          switchToTarget: allowTranslateTools,
        });
      }

      const textPart = data.response.trim();
      let assistantBody = textPart;
      const targetLang = WORKSPACE_ENVIRONMENTS[toolEnv]?.lang ?? toolEnv;

      if (isCreateTool && isStructuredProposal) {
        const name = tool.filename.trim();
        const dest =
          allowTranslateTools
            ? ` in the **${targetLang}** workspace`
            : "";
        const prefix = `Proposed new file \`${name}\`${dest} — open the diff dialog (empty original if the file is new), then Accept or Reject.`;
        assistantBody = textPart ? `${prefix}\n\n${textPart}` : prefix;
      } else if (isEditTool && isStructuredProposal) {
        const edited = tool.filename.trim();
        const dest = allowTranslateTools ? ` (${targetLang} workspace)` : "";
        const prefix = `Proposed changes for \`${edited}\`${dest} — open the diff dialog to compare original vs new code, then choose Accept or Reject.`;
        assistantBody = textPart ? `${prefix}\n\n${textPart}` : prefix;
      } else if (!assistantBody) {
        throw new Error("Invalid response from server (empty reply)");
      }

      if (typeof data.model === "string" && data.model.trim()) {
        const chain = Array.isArray(data.modelChain)
          ? data.modelChain.filter((m) => typeof m === "string" && m.trim())
          : [];
        setLastModelInfo({
          model: data.model.trim(),
          modelFallback: Boolean(data.modelFallback),
          modelChain: chain,
        });
      }

      appendMessage("assistant", assistantBody);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      appendMessage("error", msg);
    } finally {
      setPending(false);
    }
  }

  const modeCaption =
    chatMode === "agent" ? "Agent mode" : chatMode === "translate" ? "Translate mode" : "Chat mode";

  const sourceLang = WORKSPACE_ENVIRONMENTS[environment]?.lang ?? environment;

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">
        <span className="chat-panel__mode-caption" id="chat-mode-caption">
          {modeCaption}
        </span>
        <div
          className="chat-panel__mode-toggle"
          role="group"
          aria-labelledby="chat-mode-caption"
        >
          <button
            type="button"
            className={`chat-panel__mode-btn${chatMode === "chat" ? " chat-panel__mode-btn--active" : ""}`}
            onClick={() => setChatMode("chat")}
            disabled={pending || diffPreviewOpen}
            aria-pressed={chatMode === "chat"}
          >
            Chat
          </button>
          <button
            type="button"
            className={`chat-panel__mode-btn${chatMode === "agent" ? " chat-panel__mode-btn--active" : ""}`}
            onClick={() => setChatMode("agent")}
            disabled={pending || diffPreviewOpen}
            aria-pressed={chatMode === "agent"}
          >
            Agent
          </button>
          <button
            type="button"
            className={`chat-panel__mode-btn${chatMode === "translate" ? " chat-panel__mode-btn--active" : ""}`}
            onClick={() => setChatMode("translate")}
            disabled={pending || diffPreviewOpen}
            aria-pressed={chatMode === "translate"}
          >
            Translate
          </button>
        </div>
        {chatMode === "translate" && translationTargets.length > 0 ? (
          <div
            className="chat-panel__translate-target"
            role="group"
            aria-label="Translate to language"
          >
            <span className="chat-panel__translate-label">To</span>
            {translationTargets.map((target) => (
              <button
                key={target.id}
                type="button"
                className={`chat-panel__translate-btn${
                  translateTarget === target.id ? " chat-panel__translate-btn--active" : ""
                }`}
                onClick={() => setTranslateTarget(target.id)}
                disabled={pending || diffPreviewOpen || target.id === environment}
                aria-pressed={translateTarget === target.id}
                title={`Translate ${sourceLang} to ${target.lang}`}
              >
                {target.lang}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="chat-panel__thread" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 && !pending && (
          <p className="chat-panel__empty">
            {chatMode === "chat" ? (
              <>
                <strong>Chat mode</strong> — the assistant answers in natural language only; it does not apply file
                edits or return structured tool JSON. You can discuss the current{" "}
                {WORKSPACE_ENVIRONMENTS[environment]?.lang ?? environment} workspace (every tab is a{" "}
                <code>{WORKSPACE_ENVIRONMENTS[environment]?.ext ?? ""}</code> file)
                . Each request sends the <strong>project file list</strong>, the <strong>active file name</strong>, and{" "}
                <strong>full file contents</strong> (within server limits). Set <code>GEMINI_API_KEY</code> in{" "}
                <code>server/.env</code>.
              </>
            ) : chatMode === "translate" ? (
              <>
                <strong>Translate mode</strong> — ports the <strong>active file</strong> from {sourceLang} to another
                workspace language using AI. Choose the target with the <strong>To</strong> switch (only languages other
                than {sourceLang} are shown). The result is saved as{" "}
                <code>
                  name{WORKSPACE_ENVIRONMENTS[translateTarget]?.ext ?? ""}
                </code>{" "}
                with a <code>_converted</code> suffix (e.g. <code>main.js</code> →{" "}
                <code>main_converted.py</code>). A diff opens first; Accept writes to the{" "}
                <strong>{WORKSPACE_ENVIRONMENTS[translateTarget]?.lang ?? "target"}</strong> workspace and switches
                there. Ports are best-effort — review and run in the target environment.
              </>
            ) : (
              <>
                <strong>Agent mode</strong> — the model returns only <code>edit_file</code> / <code>create_file</code>{" "}
                JSON for valid{" "}
                <code>{WORKSPACE_ENVIRONMENTS[environment]?.ext ?? ""}</code> names in this environment only; a
                side-by-side diff opens first and nothing is saved until you accept. Describe the change you want in
                plain language; the reply will not include conversational prose.
              </>
            )}
          </p>
        )}
        {messages.map((msg) => (
          <article
            key={msg.id}
            className={`chat-msg chat-msg--${msg.role}`}
            aria-label={msg.role === "user" ? "You" : msg.role === "assistant" ? "AI" : "Error"}
          >
            <div className="chat-msg__avatar" aria-hidden>
              {msg.role === "user" && <User size={13} strokeWidth={2} />}
              {msg.role === "assistant" && (
                chatMode === "translate" ? (
                  <Languages size={13} strokeWidth={2} />
                ) : (
                  <Sparkles size={13} strokeWidth={2} />
                )
              )}
              {msg.role === "error" && <AlertCircle size={13} strokeWidth={2} />}
            </div>
            <div className="chat-msg__body">
              <div className="chat-msg__label">
                {msg.role === "user" && "You"}
                {msg.role === "assistant" && "AI"}
                {msg.role === "error" && "Error"}
              </div>
              <div className={`chat-msg__bubble chat-msg__bubble--${msg.role}`}>{msg.text}</div>
            </div>
          </article>
        ))}
        {pending && (
          <div className="chat-msg chat-msg--assistant" aria-busy="true">
            <div className="chat-msg__avatar" aria-hidden>
              {chatMode === "translate" ? (
                <Languages size={13} strokeWidth={2} />
              ) : (
                <Sparkles size={13} strokeWidth={2} />
              )}
            </div>
            <div className="chat-msg__body">
              <div className="chat-msg__label">AI</div>
              <div className="chat-msg__bubble chat-msg__bubble--typing">
                <span>{chatMode === "translate" ? "Translating" : "Thinking"}</span>
                <span className="chat-typing-dots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      <footer className="chat-panel__footer" aria-label="Gemini model information">
        {lastModelInfo ? (
          <p className="chat-panel__footer-status">
            Answered by{" "}
            <code className="chat-panel__footer-model chat-panel__footer-model--active">{lastModelInfo.model}</code>
            {lastModelInfo.modelFallback ? (
              <span
                className="chat-panel__footer-badge"
                title="An earlier model in the chain failed; this one succeeded"
              >
                fallback
              </span>
            ) : null}
          </p>
        ) : (
          <p className="chat-panel__footer-status chat-panel__footer-status--idle">
            Send a message to see which Gemini model replies.
          </p>
        )}
        <p className="chat-panel__footer-hint">
          <span className="chat-panel__footer-hint-label">Fallback chain</span>
          {lastModelInfo?.modelChain?.length ? (
            <span className="chat-panel__footer-chain">
              {lastModelInfo.modelChain.map((id, i) => (
                <span key={id} className="chat-panel__footer-chain-item">
                  {i > 0 ? <span className="chat-panel__footer-chain-sep" aria-hidden>→</span> : null}
                  <code
                    className={`chat-panel__footer-model${
                      id === lastModelInfo.model ? " chat-panel__footer-model--active" : ""
                    }`}
                  >
                    {id}
                  </code>
                </span>
              ))}
            </span>
          ) : (
            <span className="chat-panel__footer-chain chat-panel__footer-chain--muted">
              Server tries each model in order until one succeeds (skips the rest on auth or bad request).
            </span>
          )}
        </p>
      </footer>
      <form className="chat-panel__composer" onSubmit={handleSend}>
        <label className="visually-hidden" htmlFor="chat-input">
          {chatMode === "agent"
            ? "Edit request: describe the change you want. Enter sends; Shift+Enter adds a newline."
            : chatMode === "translate"
              ? "Translate request. Enter sends; Shift+Enter adds a newline."
              : "Message: Enter sends; Shift+Enter adds a newline."}
        </label>
        <div className="chat-panel__composer-inner">
          <textarea
            id="chat-input"
            className="chat-panel__input"
            rows={1}
            placeholder={
              chatMode === "agent"
                ? "Describe edit — Enter · Shift+Enter newline"
                : chatMode === "translate"
                  ? canTranslate
                    ? `Translate ${currentFile} — Enter · Shift+Enter newline`
                    : "Select a file to translate"
                  : "Ask AI — Enter to send · Shift+Enter newline"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            disabled={pending || diffPreviewOpen || (chatMode === "translate" && !canTranslate)}
          />
          <button
            type="submit"
            className="chat-panel__send"
            disabled={pending || diffPreviewOpen || (chatMode === "translate" ? !canTranslate : !input.trim())}
            aria-label={chatMode === "translate" ? "Translate file" : "Send message"}
          >
            <ArrowUp size={17} strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </div>
  );
}
