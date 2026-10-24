import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { shortAddress } from "../lib/format";
import { cx } from "./ui";

export type ToastKind = "pending" | "success" | "error";
export type Toast = { id: number; kind: ToastKind; title: string; body?: string; hash?: string; leaving?: boolean };

type ToastApi = {
  push: (t: Omit<Toast, "id">) => number;
  update: (id: number, t: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;
const LIFETIME: Record<ToastKind, number> = { pending: 0, success: 5000, error: 9000 };
const EXIT_MS = 220;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Mark as leaving first so the slide-out can play, then remove.
  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const autoDismiss = useCallback(
    (id: number, kind: ToastKind) => {
      if (kind !== "pending") setTimeout(() => dismiss(id), LIFETIME[kind]);
    },
    [dismiss],
  );

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((ts) => [...ts, { ...t, id }]);
      autoDismiss(id, t.kind);
      return id;
    },
    [autoDismiss],
  );

  const update = useCallback(
    (id: number, patch: Partial<Omit<Toast, "id">>) => {
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      if (patch.kind) autoDismiss(id, patch.kind);
    },
    [autoDismiss],
  );

  return (
    <ToastContext.Provider value={{ push, update, dismiss }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto relative flex gap-3 overflow-hidden rounded-xl border border-line bg-surface p-3.5 shadow-[var(--shadow-float)]",
              t.leaving ? "animate-[toast-out_0.22s_var(--ease-out)_forwards]" : "animate-toast-in",
            )}
          >
            <span
              aria-hidden
              className={cx(
                "absolute inset-y-0 left-0 w-[3px]",
                t.kind === "pending" && "bg-accent",
                t.kind === "success" && "bg-positive",
                t.kind === "error" && "bg-negative",
              )}
            />
            {t.kind !== "pending" && (
              <span
                key={t.kind}
                aria-hidden
                className={cx("absolute bottom-0 left-0 h-[2px] w-full origin-left opacity-40", t.kind === "success" ? "bg-positive" : "bg-negative")}
                style={{ animation: `progress ${LIFETIME[t.kind]}ms linear forwards` }}
              />
            )}
            <span className="mt-0.5">
              {t.kind === "pending" && <Loader2 size={18} className="animate-spin text-accent" />}
              {t.kind === "success" && <CheckCircle2 size={18} className="text-positive" />}
              {t.kind === "error" && <XCircle size={18} className="text-negative" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.body && <p className={cx("mt-0.5 text-[13px]", t.kind === "error" ? "text-negative" : "text-muted")}>{t.body}</p>}
              {t.hash && <p className="tabular mt-1 font-mono text-[11px] text-subtle">tx {shortAddress(t.hash)}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="self-start rounded-md p-0.5 text-subtle transition-colors hover:bg-sunken hover:text-ink">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
