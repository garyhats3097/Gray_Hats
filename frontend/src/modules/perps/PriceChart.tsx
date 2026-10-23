import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton, Tabs } from "../../core/components/ui";
import { fmtUsd } from "../../core/lib/format";
import { useEthHistory, usePriceHistory, type HistoryRange, type PositionView } from "./hooks";

const RANGE_SECONDS: Record<HistoryRange, number> = { "1D": 86_400, "7D": 7 * 86_400, "30D": 30 * 86_400, "1Y": 365 * 86_400 };

function axisFormatter(range: HistoryRange) {
  if (range === "1D") return (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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

  const entries = [...new Set(positions.map((p) => Number(p.entryPrice) / 1e18))];
  const prices = [...points.map((p) => p.price), ...entries];
  const lo = prices.length ? Math.min(...prices) : 0;
  const hi = prices.length ? Math.max(...prices) : 1;
  const pad = Math.max((hi - lo) * 0.1, hi * 0.005);
  const fmtAxisTime = axisFormatter(range);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={range}
          onChange={setRange}
          options={(Object.keys(RANGE_SECONDS) as HistoryRange[]).map((r) => ({ value: r, label: r }))}
        />
        <span className="text-xs text-subtle">
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
              <Area type="linear" dataKey="price" stroke="var(--color-accent)" strokeWidth={2} fill="url(#priceFill)" isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
