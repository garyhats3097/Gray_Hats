import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { Info, Loader2 } from "lucide-react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ Card

export function Card({
  title,
  info,
  action,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  info?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      data-titled={title ? "" : undefined}
      className={cx("card anim-rise min-w-0 rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)}
    >
      {(title || action) && (
        <header className={cx("flex items-center justify-between gap-3", padded ? "px-5 pt-5 sm:px-6" : "px-5 py-4 sm:px-6")}>
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-ink">
            <span aria-hidden className="mr-1 h-2 w-2 shrink-0 rounded-[2px]" style={{ background: "var(--module-color, var(--color-accent))" }} />
            {title}
            {info && <InfoTip text={info} />}
          </h2>
          {action}
        </header>
      )}
      <div className={cx(padded && "p-5 sm:p-6", padded && !!(title || action) && "pt-4 sm:pt-4")}>{children}</div>
    </section>
  );
}

// --------------------------------------------------------------- InfoTip

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={text} className="text-subtle transition-colors hover:text-accent focus:text-accent focus:outline-none">
        <Info size={14} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-30 mt-2 w-56 max-w-[70vw] -translate-x-1/2 translate-y-1 rounded-lg bg-ink px-3 py-2 text-xs font-normal leading-relaxed text-white opacity-0 shadow-[var(--shadow-float)] transition-[opacity,transform,visibility] duration-200 ease-[var(--ease-out)] group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- Button

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "accent" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform,border-color] duration-200 ease-[var(--ease-out)] [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        (variant === "primary" || variant === "accent") &&
          "bg-accent text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_1px_2px_rgb(29_78_216/0.3)] enabled:hover:-translate-y-px enabled:hover:bg-accent-hover enabled:hover:shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_8px_20px_-8px_rgb(29_78_216/0.7)]",
        variant === "secondary" &&
          "border border-line-strong bg-surface text-ink shadow-[0_1px_2px_rgb(14_23_38/0.05)] enabled:hover:-translate-y-px enabled:hover:border-subtle/60 enabled:hover:shadow-[0_6px_14px_-8px_rgb(14_23_38/0.3)]",
        variant === "ghost" && "text-muted hover:bg-sunken hover:text-ink",
        variant === "danger" &&
          "border border-negative/30 bg-surface text-negative enabled:hover:-translate-y-px enabled:hover:bg-negative-soft enabled:hover:shadow-[0_6px_14px_-8px_rgb(229_56_59/0.45)]",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
});

// ----------------------------------------------------------------- Badge

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "accent" | "positive" | "warning" | "negative";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tone === "neutral" && "bg-sunken text-muted ring-line-strong/60",
        tone === "accent" && "bg-accent-soft text-accent ring-accent/15",
        tone === "positive" && "bg-positive-soft text-positive ring-positive/15",
        tone === "warning" && "bg-warning-soft text-warning ring-warning/15",
        tone === "negative" && "bg-negative-soft text-negative ring-negative/15",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Ticker

/** Parses the number out of a formatted string ("-$1,234.50" → -1234.5). */
function numericValue(v: string): number | null {
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  return /\d/.test(v) && Number.isFinite(n) ? n : null;
}

/**
 * Renders a formatted value with each digit rolling to its place, like a split-flap board.
 * Digits are keyed from the right so "$9.99" → "$10.00" rolls instead of re-mounting.
 */
export function Ticker({ value }: { value: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const chars = value.split("");
  return (
    <span className="ticker">
      <span className="sr-only">{value}</span>
      {chars.map((c, i) => {
        const key = chars.length - i;
        if (!/\d/.test(c))
          return (
            <span key={`${key}${c}`} aria-hidden>
              {c}
            </span>
          );
        return (
          <span key={key} className="ticker-digit" aria-hidden>
            <span style={{ transform: `translateY(${mounted ? -Number(c) * 10 : 0}%)` }}>
              {DIGITS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Returns "flash-up" / "flash-down" briefly after a numeric string changes. */
export function useFlash(value: unknown) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");
  useEffect(() => {
    const before = typeof prev.current === "string" ? numericValue(prev.current) : null;
    const after = typeof value === "string" ? numericValue(value) : null;
    prev.current = value;
    if (before === null || after === null || before === after) return;
    setFlash(after > before ? "flash-up" : "flash-down");
    const t = setTimeout(() => setFlash(""), 1200);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}

// ------------------------------------------------------------------ Stat

export function Stat({
  label,
  value,
  sub,
  info,
  tone,
  loading,
  color,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  info?: string;
  tone?: "positive" | "negative";
  loading?: boolean;
  /** CSS colour for the value when no positive/negative tone applies. */
  color?: string;
}) {
  const flash = useFlash(value);
  // Long numbers ("$1,000,000.00") shrink to fit the stat's width instead of being cut off.
  const fit = typeof value === "string" ? { fontSize: `min(var(--stat-size), calc(100cqw / ${(value.length * 0.6).toFixed(1)}))` } : undefined;
  return (
    <div className="@container min-w-0">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
        {label}
        {info && <InfoTip text={info} />}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <div
          className={cx(
            "display -mx-1 mt-1 inline-block max-w-full truncate rounded-md px-1 leading-tight font-medium [--stat-size:23px] sm:[--stat-size:28px]",
            tone === "positive" && "text-positive",
            tone === "negative" && "text-negative",
            flash,
          )}
          style={{ fontSize: "var(--stat-size)", ...fit, ...(tone ? undefined : { color }) }}
        >
          {typeof value === "string" ? <Ticker value={value} /> : value}
        </div>
      )}
      {sub && <div className="mt-0.5 text-xs text-subtle">{sub}</div>}
    </div>
  );
}

/**
 * Stat in its own card. `tint` (a CSS colour) washes the card and colours the value, so each
 * headline number is recognisable at a glance; a positive/negative `tone` takes the matching tint.
 */
export function StatCard({ tint, ...props }: Parameters<typeof Stat>[0] & { tint?: string }) {
  const t = props.tone === "positive" ? "var(--color-positive)" : props.tone === "negative" ? "var(--color-negative)" : tint;
  return (
    <div
      className={cx("card anim-rise min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]", t && "tinted")}
      style={t ? ({ "--tint": t } as CSSProperties) : undefined}
    >
      <Stat {...props} color={t} />
    </div>
  );
}

// -------------------------------------------------------------- LiveDot

/** Small pulsing dot that signals a value is streaming from the chain. */
export function LiveDot({ tone = "positive" }: { tone?: "positive" | "negative" | "accent" }) {
  const color = tone === "positive" ? "bg-positive" : tone === "negative" ? "bg-negative" : "bg-accent";
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0" aria-hidden>
      <span className={cx("absolute inset-0 animate-live rounded-full", color)} />
      <span className={cx("relative h-2 w-2 rounded-full", color)} />
    </span>
  );
}

// ------------------------------------------------------------- Skeleton

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-md", className)} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

// ----------------------------------------------------------- EmptyState

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex animate-fade flex-col items-center px-6 py-10 text-center">
      {icon && (
        <div className="relative mb-4 flex h-12 w-12 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-dashed border-line-strong" />
          <span className="flex h-9 w-9 animate-float items-center justify-center rounded-full bg-surface text-muted shadow-[var(--shadow-card)] ring-1 ring-line">
            {icon}
          </span>
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// -------------------------------------------------------------- Callout

export function Callout({
  tone = "neutral",
  children,
  icon,
}: {
  tone?: "neutral" | "warning" | "negative" | "accent";
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex animate-fade gap-2.5 rounded-xl border-l-2 px-3.5 py-3 text-[13px] leading-relaxed",
        tone === "neutral" && "border-line-strong bg-sunken text-muted",
        tone === "accent" && "border-accent bg-accent-soft text-ink",
        tone === "warning" && "border-warning-mark bg-warning-soft text-ink",
        tone === "negative" && "border-negative bg-negative-soft text-ink",
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

// ----------------------------------------------------------------- Tabs

/** Measures the selected child so a pill can slide under it. */
export function useIndicator<T>(value: T) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current?.querySelector<HTMLElement>("[aria-selected=true]");
      if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [value]);
  return { ref, box };
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
}) {
  const { ref, box } = useIndicator(value);
  return (
    <div ref={ref} role="tablist" className="relative inline-flex rounded-xl bg-sunken p-1 ring-1 ring-line ring-inset">
      {box && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-lg bg-surface shadow-[0_1px_2px_rgb(14_23_38/0.1),0_2px_6px_-2px_rgb(14_23_38/0.12)] transition-[left,width] duration-300 ease-[var(--ease-out)]"
          style={{ left: box.left, width: box.width }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          title={o.title}
          aria-label={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "relative rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200",
            value === o.value ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ KeyValue

export function KeyValue({ label, value, info }: { label: string; value: ReactNode; info?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[13px]">
      <span className="flex items-center gap-1.5 text-muted">
        {label}
        {info && <InfoTip text={info} />}
      </span>
      <span className="tabular text-right font-medium text-ink">{value}</span>
    </div>
  );
}
