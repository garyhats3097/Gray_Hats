import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { MODULES } from "../../modules";

/** Section label above the title: "Modules · 01" for modules, "Core" for shell pages. */
function useEyebrow() {
  const { pathname } = useLocation();
  const i = MODULES.findIndex((m) => pathname.startsWith(m.path));
  return i === -1 ? "Core" : `Module · ${String(i + 1).padStart(2, "0")}`;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const eyebrow = useEyebrow();
  return (
    <div className="anim-rise mb-6 flex flex-col gap-3 border-b border-line pb-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:pb-6">
      <div>
        <p className="mb-2 flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--module-color, var(--color-ink))" }} />
          {eyebrow}
        </p>
        <h1 className="display text-[34px] leading-[1.05] font-medium sm:text-[42px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex gap-2">{action}</div>}
    </div>
  );
}
