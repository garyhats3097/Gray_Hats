import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LiveDot, Skeleton, Tabs } from "../../core/components/ui";
import { TOOLTIP_STYLE } from "../../core/components/AllocationDonut";
import { fmtUsd } from "../../core/lib/format";
import { useEthHistory, usePriceHistory, type HistoryRange, type PositionView } from "./hooks";

const RANGE_SECONDS: Record<HistoryRange, number> = { "1H": 3_600, "1D": 86_400, "7D": 7 * 86_400, "30D": 30 * 86_400, "1Y": 365 * 86_400 };

function axisFormatter(range: HistoryRange, spanSeconds: number) {
  if (spanSeconds < 600) return (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (range === "1H" || range === "1D") return (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (range === "1Y") return (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const fmtTooltipTime = (t: number) =>
  new Date(t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Real ETH/USD price as a line: historical market data (saved by the price feed from
 * Coinbase/Kraken/CoinGecko) followed by the live on-chain oracle price the contracts use.
 * Dashed lines mark the entry prices of the user's open positions.
 */
export function PriceChart({ positions }: { positions: PositionView[] }) {
  const [range, setRange] = useState<HistoryRange>("1D");
  const history = useEthHistory();
  const onchain = usePriceHistory();

  if (history.isLoading || onchain.isLoading) return <Skeleton className="h-[300px] w-full" />;

  const now = Date.now() / 1000;
  const since = now - RANGE_SECONDS[range];
  const past = (history.data?.ranges[range] ?? []).filter(([t]) => t >= since);
  const lastPastTime = past.length ? past[past.length - 1][0] : since;
  // Live oracle updates after the last historical point (chain time = real time).
  const live = (onchain.data ?? []).filter((d) => d.time > lastPastTime && d.time >= since).map((d) => [d.time, d.price] as [number, number]);
  const points = [...past, ...live].sort((a, b) => a[0] - b[0]).map(([time, price]) => ({ time, price }));
  // Extend the line to "now" at the latest price so recent entries fall inside the chart.
  if (points.length && points[points.length - 1].time < now) points.push({ time: now, price: points[points.length - 1].price });

  // Entry markers: where (time) and at what price each open position was opened.
  const entries = positions.map((p) => ({ id: p.id, time: Number(p.openedAt), price: Number(p.entryPrice) / 1e18, isLong: p.isLong, leverage: p.leverage }));
  const firstTime = points[0]?.time ?? since;
  const prices = [...points.map((p) => p.price), ...entries.map((e) => e.price)];
  const lo = prices.length ? Math.min(...prices) : 0;
  const hi = prices.length ? Math.max(...prices) : 1;
  const pad = Math.max((hi - lo) * 0.1, hi * 0.005);
  const fmtAxisTime = axisFormatter(range, points.length ? points[points.length - 1].time - points[0].time : 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={range}
          onChange={setRange}
          options={(Object.keys(RANGE_SECONDS) as HistoryRange[]).map((r) => ({ value: r, label: r }))}
        />
        <span className="flex items-center gap-2 text-xs text-subtle">
          <LiveDot />
          {history.data?.sources[range] ? `History: ${history.data.sources[range]}` : "History unavailable"} · Live: on-chain oracle
        </span>
      </div>
      {points.length < 2 ? (
        <p className="py-20 text-center text-sm text-muted">
          Waiting for real price data. The live feed starts with <code className="rounded bg-sunken px-1">./scripts/start-chain.sh</code> and needs internet.
        </p>
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer>
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.14} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={fmtAxisTime}
                tick={{ fontSize: 11, fill: "var(--color-subtle)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={50}
              />
              <YAxis
                domain={[Math.max(0, lo - pad), hi + pad]}
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
                contentStyle={TOOLTIP_STYLE}
                cursor={{ stroke: "var(--color-line-strong)", strokeDasharray: "3 3" }}
              />
              {entries.map((e) => (
                <ReferenceLine
                  key={`l${e.id}`}
                  y={e.price}
                  stroke={e.isLong ? "var(--color-positive)" : "var(--color-negative)"}
                  strokeOpacity={0.45}
                  strokeDasharray="4 4"
                />
              ))}
              {entries
                .filter((e) => e.time >= firstTime)
                .map((e) => (
                  <ReferenceDot
                    key={`d${e.id}`}
                    x={e.time}
                    y={e.price}
                    ifOverflow="extendDomain"
                    shape={(props: { cx?: number; cy?: number }) => <EntryMarker cx={props.cx ?? 0} cy={props.cy ?? 0} isLong={e.isLong} />}
                  />
                ))}
              <Area type="linear" dataKey="price" stroke="var(--color-accent)" strokeWidth={2} fill="url(#priceFill)" isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }} />
              <ReferenceDot
                x={points[points.length - 1].time}
                y={points[points.length - 1].price}
                ifOverflow="extendDomain"
                shape={(props: { cx?: number; cy?: number }) => <LivePoint cx={props.cx ?? 0} cy={props.cy ?? 0} />}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {entries.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden>
              <path d={TRIANGLE_UP} fill="var(--color-positive)" />
            </svg>
            Long entry ({entries.filter((e) => e.isLong).length})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden>
              <path d={TRIANGLE_DOWN} fill="var(--color-negative)" />
            </svg>
            Short entry ({entries.filter((e) => !e.isLong).length})
          </span>
          <span className="text-subtle">Marker = time and price the position was opened. Dashed line = its entry price.</span>
          {entries.some((e) => e.time < firstTime) && <span className="text-subtle">Some entries are older than this range: choose a longer range to see them.</span>}
        </div>
      )}
    </div>
  );
}

/** Pulsing marker on the most recent price. */
function LivePoint({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={4} fill="var(--color-accent)" className="animate-live" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
      <circle r={4} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
    </g>
  );
}

const TRIANGLE_UP = "M 0 -5 L 5.5 4 L -5.5 4 Z";
const TRIANGLE_DOWN = "M 0 5 L 5.5 -4 L -5.5 -4 Z";

/** ▲ green for a long entry, ▼ red for a short entry, with a white outline so it stands out on the line. */
function EntryMarker({ cx, cy, isLong }: { cx: number; cy: number; isLong: boolean }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <path d={isLong ? TRIANGLE_UP : TRIANGLE_DOWN} transform="scale(1.4)" fill={isLong ? "var(--color-positive)" : "var(--color-negative)"} stroke="var(--color-surface)" strokeWidth={1.2} />
    </g>
  );
}
