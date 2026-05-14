import { useEffect, useRef, useState } from "react";

export default function ChatPanel() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const listRef = useRef(null);

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
    setMessages((m) => [...m, { role: "user", text }]);
    setPending(true);

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof data.detail === "string" ? data.detail : null;
        const errLabel = typeof data.error === "string" ? data.error : "Request failed";
        throw new Error(detail || errLabel);
      }
      if (typeof data.response !== "string") {
        throw new Error("Invalid response from server");
      }
      setMessages((m) => [...m, { role: "assistant", text: data.response }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((m) => [...m, { role: "error", text: msg }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel__messages" ref={listRef} role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="chat-panel__empty">
            Ask about your code, refactors, or bugs. Requires <code>GEMINI_API_KEY</code> on
            the server.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={`${i}-${msg.role}`}
            className={`chat-panel__bubble chat-panel__bubble--${msg.role}`}
          >
            {msg.text}
          </div>
        ))}
        {pending && <div className="chat-panel__bubble chat-panel__bubble--typing">…</div>}
      </div>
      <form className="chat-panel__form" onSubmit={handleSend}>
        <label className="visually-hidden" htmlFor="chat-input">
          Message
        </label>
        <textarea
          id="chat-input"
          className="chat-panel__input"
          rows={2}
          placeholder="Message…"
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
