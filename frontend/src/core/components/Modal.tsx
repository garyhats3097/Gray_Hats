import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "./ui";

const EXIT_MS = 160;

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  // Stay mounted briefly after closing so the exit animation can play.
  const [mounted, setMounted] = useState(open);
  const lastChildren = useRef(children);
  if (open) lastChildren.current = children;
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return;
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  const leaving = !open;
  return (
    <div
      className={cx(
        "fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-0 backdrop-blur-[3px] transition-opacity sm:items-center sm:p-4",
        leaving ? "pointer-events-none opacity-0" : "animate-fade",
      )}
      style={{ transitionDuration: `${EXIT_MS}ms` }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cx(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-[var(--shadow-float)] transition-transform sm:max-w-md sm:rounded-2xl sm:p-6",
          leaving ? "translate-y-2 scale-[0.98]" : "animate-sheet sm:animate-pop",
        )}
        style={{ transitionDuration: `${EXIT_MS}ms` }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="display text-[22px] font-medium">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-subtle transition-[background-color,color,transform] duration-200 hover:rotate-90 hover:bg-sunken hover:text-ink">
            <X size={20} />
          </button>
        </div>
        {open ? children : lastChildren.current}
      </div>
    </div>
  );
}
