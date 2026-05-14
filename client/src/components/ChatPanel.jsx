import { useCallback, useEffect, useRef, useState } from "react";

export default function ChatPanel({ files = {}, currentFile = null, onToolCall }) {
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
    if (!text || pending) return;

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

      if (isEditTool) {
        onToolCall?.(tool);
      }

      const textPart = data.response.trim();
      const toolNote = isEditTool ? `Applied edit: ${tool.filename}` : "";

      if (!textPart && !isEditTool) {
        throw new Error("Invalid response from server (empty reply)");
      }

      const assistantBody = [textPart, toolNote].filter(Boolean).join("\n\n");
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
      <div className="chat-panel__messages" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 && !pending && (
          <p className="chat-panel__empty">
            Sends your message and workspace files to <code>POST /chat</code>. The assistant can
            reply with text or a structured <code>edit_file</code> action (applied to the editor
            automatically). Set <code>GEMINI_API_KEY</code> in <code>server/.env</code>.
          </p>
        )}
        {messages.map((msg) => (
          <article
            key={msg.id}
            className={`chat-panel__turn chat-panel__turn--${msg.role}`}
            aria-label={msg.role === "user" ? "You" : msg.role === "assistant" ? "Assistant" : "Error"}
          >
            <div className="chat-panel__turn-meta">
              {msg.role === "user" && "You"}
              {msg.role === "assistant" && "Assistant"}
              {msg.role === "error" && "Error"}
            </div>
            <div className={`chat-panel__bubble chat-panel__bubble--${msg.role}`}>{msg.text}</div>
          </article>
        ))}
        {pending && (
          <div className="chat-panel__turn chat-panel__turn--assistant" aria-busy="true">
            <div className="chat-panel__turn-meta">Assistant</div>
            <div className="chat-panel__bubble chat-panel__bubble--typing">Thinking…</div>
          </div>
        )}
      </div>
      <form className="chat-panel__form" onSubmit={handleSend}>
        <label className="visually-hidden" htmlFor="chat-input">
          Message
        </label>
        <textarea
          id="chat-input"
          className="chat-panel__input"
          rows={2}
          placeholder="Ask the assistant… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          disabled={pending}
        />
        <button type="submit" className="chat-panel__send" disabled={pending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
