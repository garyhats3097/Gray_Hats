import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
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
    <section className={cx("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)}>
      {(title || action) && (
        <header className={cx("flex items-center justify-between gap-3", padded ? "px-5 pt-5 sm:px-6" : "px-5 py-4 sm:px-6")}>
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
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
      <button type="button" aria-label={text} className="text-subtle hover:text-muted focus:text-muted focus:outline-none">
        <Info size={14} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-60 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
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
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        variant === "primary" && "bg-ink text-white hover:bg-black",
        variant === "accent" && "bg-accent text-white hover:bg-accent-hover",
        variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-sunken",
        variant === "ghost" && "text-muted hover:bg-sunken hover:text-ink",
        variant === "danger" && "border border-negative/30 bg-surface text-negative hover:bg-negative-soft",
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-sunken text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "positive" && "bg-positive-soft text-positive",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "negative" && "bg-negative-soft text-negative",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ Stat

export function Stat({
  label,
  value,
  sub,
  info,
  tone,
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  info?: string;
  tone?: "positive" | "negative";
  loading?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[13px] text-muted">
        {label}
        {info && <InfoTip text={info} />}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <div
          className={cx(
            "tabular mt-1 truncate text-2xl font-semibold tracking-tight",
            tone === "positive" && "text-positive",
            tone === "negative" && "text-negative",
          )}
        >
          {value}
        </div>
      )}
      {sub && <div className="mt-0.5 text-xs text-subtle">{sub}</div>}
    </div>
  );
}

export function StatCard(props: Parameters<typeof Stat>[0]) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
      <Stat {...props} />
    </div>
  );
}

// ------------------------------------------------------------- Skeleton

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-sunken", className)} />;
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
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-sunken text-muted">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
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
        "flex gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed",
        tone === "neutral" && "bg-sunken text-muted",
        tone === "accent" && "bg-accent-soft text-ink",
        tone === "warning" && "bg-warning-soft text-ink",
        tone === "negative" && "bg-negative-soft text-ink",
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

// ----------------------------------------------------------------- Tabs

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="tablist" className="inline-flex rounded-xl bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
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
