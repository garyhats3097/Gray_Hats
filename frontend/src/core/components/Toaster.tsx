import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { shortAddress } from "../lib/format";
import { cx } from "./ui";

export type ToastKind = "pending" | "success" | "error";
export type Toast = { id: number; kind: ToastKind; title: string; body?: string; hash?: string };

type ToastApi = {
  push: (t: Omit<Toast, "id">) => number;
  update: (id: number, t: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const autoDismiss = useCallback(
    (id: number, kind: ToastKind) => {
      if (kind !== "pending") setTimeout(() => dismiss(id), kind === "error" ? 9000 : 5000);
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
            className="pointer-events-auto flex gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-lg"
          >
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
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="self-start text-subtle hover:text-ink">
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
