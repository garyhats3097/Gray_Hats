import { useEffect, useRef, useState } from "react";
import { Ticker, cx } from "./ui";

/** Eases a number toward `target` so the gauge needle sweeps instead of jumping. */
function useTween(target: number, ms = 900) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setV(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min((now - start) / ms, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const next = a + (target - a) * e;
      from.current = next;
      setV(next);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Health factor → status. Thresholds match the lending rules (liquidation below 1.0). */
export function healthStatus(hf: number | null): { label: string; tone: "positive" | "warning" | "negative" | "neutral" } {
  if (hf === null) return { label: "No debt", tone: "neutral" };
  if (hf < 1) return { label: "Liquidatable", tone: "negative" };
  if (hf < 1.25) return { label: "At risk", tone: "warning" };
  return { label: "Healthy", tone: "positive" };
}

/** Always round DOWN so 0.998 shows as 0.99, never as a misleading "1.00". */
export function fmtHealth(hf: number | null): string {
  if (hf === null) return "∞";
  if (hf > 99) return "99+";
  return (Math.floor(hf * 100) / 100).toFixed(2);
}

const MAX = 3; // gauge scale: 0 → 3.0+
const ZONES = [
  { from: 0, to: 1, color: "var(--color-negative)" },
  { from: 1, to: 1.25, color: "var(--color-warning-mark)" },
  { from: 1.25, to: MAX, color: "var(--color-positive)" },
];

/** Semicircle gauge. `hf` is null when there is no debt. */
export function HealthGauge({ hf }: { hf: number | null }) {
  const status = healthStatus(hf);
  const cx0 = 100, cy0 = 100, r = 80;

  const point = (v: number, radius = r) => {
    const angle = Math.PI * (1 - Math.min(Math.max(v, 0), MAX) / MAX);
    return [cx0 + radius * Math.cos(angle), cy0 - radius * Math.sin(angle)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  const needle = useTween(hf === null ? 0 : Math.min(hf, MAX));
  const marker = hf === null ? null : point(needle);
  const alert = status.tone === "negative" || status.tone === "warning";

  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 116" className="w-full" role="img" aria-label={`Health factor ${hf === null ? "not applicable" : fmtHealth(hf)}`}>
        <path d={arc(0.02, MAX - 0.02)} stroke="var(--color-sunken)" strokeWidth={12} fill="none" />
        {ZONES.map((z, i) => (
          <path
            key={z.from}
            d={arc(z.from + 0.02, z.to - 0.02)}
            stroke={z.color}
            strokeWidth={12}
            fill="none"
            strokeLinecap="butt"
            opacity={hf === null ? 0.25 : 0.9}
            pathLength={1}
            strokeDasharray="1 1"
            style={{ animation: `draw 0.7s var(--ease-out) ${i * 0.18}s backwards` }}
          />
        ))}
        {Array.from({ length: 13 }, (_, i) => {
          const v = (i / 12) * MAX;
          const [x1, y1] = point(v, r + 9);
          const [x2, y2] = point(v, r + (i % 4 === 0 ? 14 : 11.5));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-line-strong)" strokeWidth={1} />;
        })}
        {[1, 2, 3].map((v) => {
          const [x, y] = point(v, r - 20);
          return (
            <text key={v} x={x} y={y + 3} textAnchor="middle" className="fill-subtle text-[9px]">
              {v === 3 ? "3+" : v}
            </text>
          );
        })}
        {marker && alert && (
          <circle cx={marker[0]} cy={marker[1]} r={8} fill={status.tone === "negative" ? "var(--color-negative)" : "var(--color-warning-mark)"} className="animate-live" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
        )}
        {marker && <circle cx={marker[0]} cy={marker[1]} r={8} fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth={3} style={{ filter: "drop-shadow(0 2px 3px rgb(14 23 38 / 0.25))" }} />}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span
          className={cx(
            "mb-1 rounded-full px-2 py-0.5 text-xs font-medium",
            status.tone === "positive" && "bg-positive-soft text-positive",
            status.tone === "warning" && "bg-warning-soft text-warning",
            status.tone === "negative" && "bg-negative-soft text-negative",
            status.tone === "neutral" && "bg-sunken text-muted",
          )}
        >
          {status.label}
        </span>
        <span className="display text-[34px] leading-none font-medium">
          <Ticker value={fmtHealth(hf)} />
        </span>
      </div>
    </div>
  );
}
