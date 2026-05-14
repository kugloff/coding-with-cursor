import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUp, Sparkles, User } from "lucide-react";

export default function ChatPanel({
  files = {},
  currentFile = null,
  onAiEditProposal,
  diffPreviewOpen = false,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const listRef = useRef(null);
  const messageIdRef = useRef(0);

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

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending || diffPreviewOpen) return;

    setInput("");
    appendMessage("user", text);
    setPending(true);

    try {
      const payload = {
        message: text,
        files,
        currentFile: currentFile ?? null,
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

      const tool = data.toolCall;
      const isEditTool =
        tool &&
        typeof tool === "object" &&
        tool.action === "edit_file" &&
        typeof tool.filename === "string" &&
        typeof tool.content === "string";

      const isCreateTool =
        tool &&
        typeof tool === "object" &&
        tool.action === "create_file" &&
        typeof tool.filename === "string" &&
        typeof tool.content === "string";

      const isFileProposal = isEditTool || isCreateTool;

      if (isFileProposal) {
        onAiEditProposal?.(tool);
      }

      const textPart = data.response.trim();

      let assistantBody = textPart;

      if (isCreateTool) {
        const name = tool.filename.trim();
        const prefix = `Proposed new file \`${name}\` — open the diff dialog (empty original if the file is new), then Accept or Reject.`;
        assistantBody = textPart ? `${prefix}\n\n${textPart}` : `${prefix}`;
      } else if (isEditTool) {
        const edited = tool.filename.trim();
        const prefix = `Proposed changes for \`${edited}\` — open the diff dialog to compare original vs new code, then choose Accept or Reject.`;
        assistantBody = textPart ? `${prefix}\n\n${textPart}` : `${prefix}`;
      } else if (!assistantBody) {
        throw new Error("Invalid response from server (empty reply)");
      }

      appendMessage("assistant", assistantBody);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      appendMessage("error", msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel__thread" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 && !pending && (
          <p className="chat-panel__empty">
            Cursor-style chat: ask about your code, or let the model return an{" "}
            <code>edit_file</code> / <code>create_file</code> JSON actions — a side-by-side diff opens first; nothing is saved until you accept. Each request sends the{" "}
            <strong>project file list</strong>, the <strong>active file name</strong>, and{" "}
            <strong>full file contents</strong> (within server limits). Set <code>GEMINI_API_KEY</code> in{" "}
            <code>server/.env</code>.
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
              {msg.role === "assistant" && <Sparkles size={13} strokeWidth={2} />}
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
              <Sparkles size={13} strokeWidth={2} />
            </div>
            <div className="chat-msg__body">
              <div className="chat-msg__label">AI</div>
              <div className="chat-msg__bubble chat-msg__bubble--typing">
                <span>Thinking</span>
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
      <form className="chat-panel__composer" onSubmit={handleSend}>
        <label className="visually-hidden" htmlFor="chat-input">
          Message
        </label>
        <div className="chat-panel__composer-inner">
          <textarea
            id="chat-input"
            className="chat-panel__input"
            rows={1}
            placeholder="Ask AI — Enter to send · Shift+Enter newline"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            disabled={pending || diffPreviewOpen}
          />
          <button
            type="submit"
            className="chat-panel__send"
            disabled={pending || diffPreviewOpen || !input.trim()}
            aria-label="Send message"
          >
            <ArrowUp size={17} strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </div>
  );
}
