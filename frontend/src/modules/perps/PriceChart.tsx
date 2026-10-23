import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBlock } from "wagmi";
import { Skeleton } from "../../core/components/ui";
import { fmtUsd } from "../../core/lib/format";
import { usePriceHistory, type PositionView } from "./hooks";

const fmtTooltipTime = (t: number) =>
  new Date(t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Axis labels adapt to the time span (demo price changes can be seconds apart). */
function axisFormatter(spanSeconds: number) {
  if (spanSeconds < 3600) return (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (spanSeconds < 2 * 86_400) return (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (spanSeconds < 90 * 86_400) return (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/**
 * ETH/USD mock-oracle price over time. The oracle only changes when someone sets a
 * price, so the line is drawn as steps (the price holds until the next update).
 * Dashed lines mark the entry prices of the user's open positions.
 */
export function PriceChart({ positions }: { positions: PositionView[] }) {
  const { data, isLoading } = usePriceHistory();
  const { data: block } = useBlock({ watch: true });

  if (isLoading) return <Skeleton className="h-[260px] w-full" />;
  if (!data?.length) return <p className="py-16 text-center text-sm text-muted">No price data yet.</p>;

  // Extend the last price to "now" (latest block time) so the chart reaches the present.
  const now = block ? Number(block.timestamp) : data[data.length - 1].time;
  // Updates are in chain order. If a test chain's clock ever went backwards, clamp each time to
  // be no earlier than the previous one, so the line never doubles back on itself.
  const points: { time: number; price: number }[] = [];
  for (const d of data) {
    const prev = points[points.length - 1];
    points.push({ time: prev && d.time < prev.time ? prev.time : d.time, price: d.price });
  }
  if (now > points[points.length - 1].time) points.push({ time: now, price: points[points.length - 1].price });
  // A single update would be a dot; give it some width.
  if (points.length === 1) points.unshift({ time: points[0].time - 60, price: points[0].price });

  const fmtAxisTime = axisFormatter(points[points.length - 1].time - points[0].time);
  const entries = [...new Set(positions.map((p) => Number(p.entryPrice) / 1e18))];
  const prices = [...points.map((p) => p.price), ...entries];
  const pad = Math.max((Math.max(...prices) - Math.min(...prices)) * 0.15, Math.max(...prices) * 0.01);

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={fmtAxisTime}
            tick={{ fontSize: 11, fill: "var(--color-subtle)" }}
            axisLine={false}
            tickLine={false}
            minTickGap={60}
          />
          <YAxis
            domain={[Math.max(0, Math.min(...prices) - pad), Math.max(...prices) + pad]}
            tickFormatter={(v: number) => `$${Math.round(v).toLocaleString()}`}
            tick={{ fontSize: 11, fill: "var(--color-subtle)" }}
            axisLine={false}
            tickLine={false}
            width={64}
            orientation="right"
          />
          <Tooltip
            labelFormatter={(t: number) => fmtTooltipTime(t)}
            formatter={(v: number) => [fmtUsd(v), "ETH/USD"]}
            contentStyle={{ borderRadius: 10, border: "1px solid var(--color-line)", fontSize: 12 }}
            cursor={{ stroke: "var(--color-line-strong)" }}
          />
          {entries.map((e) => (
            <ReferenceLine
              key={e}
              y={e}
              stroke="var(--color-muted)"
              strokeDasharray="4 4"
              label={{ value: `Entry ${fmtUsd(e)}`, position: "insideTopLeft", fontSize: 11, fill: "var(--color-muted)" }}
            />
          ))}
          <Area type="stepAfter" dataKey="price" stroke="var(--color-accent)" strokeWidth={2} fill="url(#priceFill)" isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
