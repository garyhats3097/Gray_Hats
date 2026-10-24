import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fmtUsd, toNumber } from "../lib/format";
import type { AllocationSegment } from "./AllocationBar";

export const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid var(--color-line)",
  fontSize: 12,
  boxShadow: "var(--shadow-float)",
};

/** Donut of the same allocation, with the total in the middle (as in the reference design). */
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
          >
            {(empty ? [{ color: "var(--color-sunken)" }] : data).map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          {!empty && (
            <Tooltip
              formatter={(v: number, name: string) => [fmtUsd(v), name]}
              contentStyle={TOOLTIP_STYLE}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted">{centerLabel}</span>
        <span className="display text-[26px] leading-tight font-medium">{centerValue}</span>
      </div>
    </div>
  );
}
