import { cx } from "./ui";

/** Health factor → status. Thresholds match the lending rules (liquidation below 1.0). */
export function healthStatus(hf: number | null): { label: string; tone: "positive" | "warning" | "negative" | "neutral" } {
  if (hf === null) return { label: "No debt", tone: "neutral" };
  if (hf < 1) return { label: "Liquidatable", tone: "negative" };
  if (hf < 1.25) return { label: "At risk", tone: "warning" };
  return { label: "Healthy", tone: "positive" };
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

  const marker = hf === null ? null : point(Math.min(hf, MAX));

  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 200 116" className="w-full" role="img" aria-label={`Health factor ${hf === null ? "not applicable" : hf.toFixed(2)}`}>
        {ZONES.map((z) => (
          <path
            key={z.from}
            d={arc(z.from + 0.02, z.to - 0.02)}
            stroke={z.color}
            strokeWidth={12}
            fill="none"
            strokeLinecap="butt"
            opacity={hf === null ? 0.25 : 0.9}
          />
        ))}
        {[1, 2, 3].map((v) => {
          const [x, y] = point(v, r - 20);
          return (
            <text key={v} x={x} y={y + 3} textAnchor="middle" className="fill-subtle text-[9px]">
              {v === 3 ? "3+" : v}
            </text>
          );
        })}
        {marker && <circle cx={marker[0]} cy={marker[1]} r={8} fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth={3} />}
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
        <span className="tabular text-3xl font-semibold tracking-tight">{hf === null ? "∞" : hf > 99 ? "99+" : hf.toFixed(2)}</span>
      </div>
    </div>
  );
}
