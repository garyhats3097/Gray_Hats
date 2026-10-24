import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, ArrowUp, Loader2, MessageCircle, RotateCcw, X } from "lucide-react";
import { cx } from "../core/components/ui";
import { MODULES } from "../modules";
import { Markdown } from "./Markdown";
import { useChatContext } from "./useChatContext";

type Message = { role: "user" | "assistant"; text: string; error?: boolean };
type Status = "checking" | "ready" | "no-key" | "offline";

const STORAGE_KEY = "modular-defi.chat";

function loadMessages(): Message[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
  } catch {
    // storage unavailable (private window): the chat just isn't remembered
  }
}

/** Suggested first questions, depending on the page. */
function suggestionsFor(pathname: string): string[] {
  const module = MODULES.find((m) => pathname.startsWith(m.path))?.id;
  if (module === "perps") return ["How is my liquidation price calculated?", "What does 10x leverage mean?", "Where does trading profit come from?"];
  if (module === "lending") return ["Why can't I borrow more?", "How do I raise my credit score?", "What is a health factor?"];
  if (module === "market-maker") return ["What is a spread?", "Why are quotes not executable?", "What would a full market maker do?"];
  if (pathname === "/vault") return ["What's the difference between wallet and vault?", "Why can't I withdraw everything?", "How do I get test mUSDC?"];
  if (pathname === "/help" || pathname === "/explorer")
    return ["Why does MetaMask say a transaction failed?", "How do I set up MetaMask?", "What does the Explorer show?"];
  return ["Explain my portfolio", "What can I do on this site?", "What is a shared vault?"];
}

/** Floating help assistant, available on every page. */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <ChatPanel onClose={() => setOpen(false)} />}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="fixed right-4 bottom-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_30px_-8px_rgb(29_78_216/0.7)] transition-[transform,background-color] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:bg-accent-hover sm:right-6 sm:bottom-6"
      >
        {open ? <X size={22} /> : <MessageCircle size={24} />}
      </button>
    </>
  );
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation();
  const context = useChatContext();
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>("checking");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => saveMessages(messages), [messages]);
  useEffect(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), [messages, busy]);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Is the assistant server running, and does it have a key?
  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((h: { hasKey: boolean }) => !cancelled && setStatus(h.hasKey ? "ready" : "no-key"))
      .catch(() => !cancelled && setStatus("offline"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = [...messages.filter((m) => !m.error), { role: "user" as const, text: q }];
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, text }) => ({ role, text })), context }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.reply !== "string") {
        // No JSON error from our server means it isn't running (the dev proxy answered instead).
        throw new Error(data.error ?? "The assistant isn't running. Start it with: cd chatbot && npm start");
      }
      setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
      setStatus("ready");
    } catch (e) {
      const text = e instanceof TypeError ? "Couldn't reach the assistant. Is the site still running?" : (e as Error).message;
      setMessages((m) => [...m, { role: "assistant", text, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Assistant"
      className="fixed right-4 bottom-22 z-40 flex h-[min(620px,calc(100dvh-7.5rem))] w-[min(400px,calc(100vw-2rem))] animate-pop flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-float)] sm:right-6 sm:bottom-24"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
            <MessageCircle size={16} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink">Assistant</p>
            <p className="text-[11px] text-subtle">AI answers can be wrong. Never share your keys.</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              aria-label="New conversation"
              title="New conversation"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition-colors hover:bg-sunken hover:text-ink">
            <X size={18} />
          </button>
        </div>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-[13px] leading-relaxed text-muted">
        {status === "offline" && (
          <Notice>
            The assistant isn't running. In a new WSL terminal run <code className="rounded bg-surface px-1">cd chatbot && npm start</code>, then reopen this
            chat.
          </Notice>
        )}
        {status === "no-key" && (
          <Notice>
            The assistant has no AI key yet. Copy <code className="rounded bg-surface px-1">chatbot/.env.example</code> to{" "}
            <code className="rounded bg-surface px-1">chatbot/.env</code>, add a free Gemini key, and restart it.
          </Notice>
        )}

        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-ink">
              Hi! Ask me about this site, DeFi terms, or your own position — I can see your vault, trades, loan and credit score on this page.
            </p>
            <div className="flex flex-col items-start gap-2">
              {suggestionsFor(pathname).map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={busy || status === "offline" || status === "no-key"}
                  className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-left text-[12.5px] text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3 py-2 whitespace-pre-wrap text-white">
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className={cx(
                "max-w-[92%] rounded-2xl rounded-bl-md px-3 py-2",
                m.error ? "flex items-start gap-2 bg-negative-soft text-ink" : "bg-sunken text-ink/90",
              )}
            >
              {m.error && <AlertTriangle size={14} className="mt-0.5 shrink-0 text-negative" />}
              {m.error ? <span>{m.text}</span> : <Markdown text={m.text} />}
            </div>
          ),
        )}
        {busy && (
          <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-sunken px-3 py-2 text-subtle">
            <Loader2 size={14} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex items-end gap-2 border-t border-line p-3"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Ask a question…"
          aria-label="Your question"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-subtle focus:border-accent"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          <ArrowUp size={18} />
        </button>
      </form>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5 text-ink">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
      <span>{children}</span>
    </div>
  );
}
