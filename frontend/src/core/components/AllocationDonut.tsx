import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { fmtUsd, toNumber } from "../lib/format";
import type { AllocationSegment } from "./AllocationBar";

export const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid var(--color-line)",
  fontSize: 12,
  boxShadow: "var(--shadow-float)",
};

/**
 * Donut of the same allocation, with the total in the middle (as in the reference design).
 * Hovering a segment shows that segment in the middle instead of a floating tooltip,
 * which would otherwise sit on top of the centre label.
 */
export function AllocationDonut({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: AllocationSegment[];
  centerLabel: string;
  centerValue: string;
}) {
  const data = segments.filter((s) => s.value > 0n).map((s) => ({ name: s.label, value: toNumber(s.value), color: s.color }));
  const empty = data.length === 0;
  const [active, setActive] = useState<number | null>(null);
  const hovered = active === null ? undefined : data[active];

  return (
    <div className="relative h-[220px] w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={empty ? [{ name: "Empty", value: 1, color: "var(--color-sunken)" }] : data}
            dataKey="value"
            innerRadius="72%"
            outerRadius="96%"
            paddingAngle={empty || data.length === 1 ? 0 : 2}
            stroke="var(--color-surface)"
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            animationDuration={700}
            animationEasing="ease-out"
            onMouseEnter={(_, i) => !empty && setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            {(empty ? [{ color: "var(--color-sunken)" }] : data).map((d, i) => (
              <Cell key={i} fill={d.color} opacity={active === null || active === i ? 1 : 0.35} style={{ transition: "opacity 0.2s" }} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {hovered && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: hovered.color }} />}
          {hovered ? hovered.name : centerLabel}
        </span>
        <span className="display text-[26px] leading-tight font-medium">{hovered ? fmtUsd(hovered.value) : centerValue}</span>
      </div>
    </div>
  );
}
