import { useState, type ReactNode } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LiveDot, Skeleton, Tabs } from "../../core/components/ui";
import { TOOLTIP_STYLE } from "../../core/components/AllocationDonut";
import { fmtUsd } from "../../core/lib/format";
import { useEthHistory, usePriceHistory, type HistoryPoint, type HistoryRange, type PositionView } from "./hooks";

const RANGE_SECONDS: Record<HistoryRange, number> = { "1H": 3_600, "1D": 86_400, "7D": 7 * 86_400, "30D": 30 * 86_400, "1Y": 365 * 86_400 };
/** Candle size per range, chosen so each view shows roughly 40–100 candles. */
const CANDLE_SECONDS: Record<HistoryRange, number> = { "1H": 60, "1D": 900, "7D": 2 * 3_600, "30D": 12 * 3_600, "1Y": 7 * 86_400 };

type ChartType = "line" | "area" | "candles" | "hollow" | "heikin" | "bars";
const CANDLE_TYPES: ChartType[] = ["candles", "hollow", "heikin", "bars"];
const CHART_TYPE_KEY = "perps.chartType";

type Candle = { time: number; open: number; high: number; low: number; close: number; range: [number, number] };

/** Group price points into fixed-size candles. Close-only points open at the previous candle's close. */
function toCandles(points: HistoryPoint[], bucket: number): Candle[] {
  const out: Candle[] = [];
  for (const [t, close, open, high, low] of points) {
    const time = Math.floor(t / bucket) * bucket;
    const last = out[out.length - 1];
    if (last && last.time === time) {
      last.high = Math.max(last.high, high ?? close);
      last.low = Math.min(last.low, low ?? close);
      last.close = close;
    } else {
      const o = open ?? last?.close ?? close;
      out.push({ time, open: o, high: Math.max(o, high ?? close), low: Math.min(o, low ?? close), close, range: [0, 0] });
    }
  }
  for (const c of out) c.range = [c.low, c.high];
  return out;
}

/** Heikin Ashi: averaged candles that smooth out noise and make trends easier to read. */
function toHeikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) {
    const prev = out[out.length - 1];
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    const high = Math.max(c.high, open, close);
    const low = Math.min(c.low, open, close);
    out.push({ time: c.time, open, high, low, close, range: [low, high] });
  }
  return out;
}

function readChartType(): ChartType {
  try {
    const saved = localStorage.getItem(CHART_TYPE_KEY) as ChartType | null;
    if (saved && saved in CHART_TYPE_LABELS) return saved;
  } catch {
    /* storage unavailable */
  }
  return "area";
}

function axisFormatter(range: HistoryRange, spanSeconds: number) {
  if (spanSeconds < 600) return (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (range === "1H" || range === "1D") return (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (range === "1Y") return (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const fmtTooltipTime = (t: number) =>
  new Date(t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Real ETH/USD price as a line, area, candles or bars: historical market data (saved by the price feed from
 * Coinbase/Kraken/CoinGecko) followed by the live on-chain oracle price the contracts use.
 * Dashed lines mark the entry prices of the user's open positions.
 */
export function PriceChart({ positions }: { positions: PositionView[] }) {
  const [range, setRange] = useState<HistoryRange>("1D");
  const [chartType, setChartTypeState] = useState<ChartType>(readChartType);
  const setChartType = (t: ChartType) => {
    setChartTypeState(t);
    try {
      localStorage.setItem(CHART_TYPE_KEY, t);
    } catch {
      /* storage unavailable */
    }
  };
  const history = useEthHistory();
  const onchain = usePriceHistory();

  if (history.isLoading || onchain.isLoading) return <Skeleton className="h-[300px] w-full" />;

  const now = Date.now() / 1000;
  const since = now - RANGE_SECONDS[range];
  const past = (history.data?.ranges[range] ?? []).filter(([t]) => t >= since);
  const lastPastTime = past.length ? past[past.length - 1][0] : since;
  // Live oracle updates after the last historical point (chain time = real time).
  const live = (onchain.data ?? []).filter((d) => d.time > lastPastTime && d.time >= since).map((d): HistoryPoint => [d.time, d.price]);
  const merged = [...past, ...live].sort((a, b) => a[0] - b[0]);
  const points = merged.map(([time, price]) => ({ time, price }));
  // Extend the line to "now" at the latest price so recent entries fall inside the chart.
  if (points.length && points[points.length - 1].time < now) points.push({ time: now, price: points[points.length - 1].price });

  const isCandles = CANDLE_TYPES.includes(chartType);
  const bucket = CANDLE_SECONDS[range];
  const rawCandles = isCandles ? toCandles(merged, bucket) : [];
  const candles = chartType === "heikin" ? toHeikinAshi(rawCandles) : rawCandles;

  // Entry markers: where (time) and at what price each open position was opened.
  const entries = positions.map((p) => ({ id: p.id, time: Number(p.openedAt), price: Number(p.entryPrice) / 1e18, isLong: p.isLong, leverage: p.leverage }));
  const firstTime = isCandles ? (candles[0]?.time ?? since) : (points[0]?.time ?? since);
  const prices = [...(isCandles ? candles.flatMap((c) => [c.low, c.high]) : points.map((p) => p.price)), ...entries.map((e) => e.price)];
  const lo = prices.length ? Math.min(...prices) : 0;
  const hi = prices.length ? Math.max(...prices) : 1;
  const pad = Math.max((hi - lo) * 0.1, hi * 0.005);
  const fmtAxisTime = axisFormatter(range, points.length ? points[points.length - 1].time - points[0].time : 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={range}
            onChange={setRange}
            options={(Object.keys(RANGE_SECONDS) as HistoryRange[]).map((r) => ({ value: r, label: r }))}
          />
          <Tabs
            value={chartType}
            onChange={setChartType}
            options={(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((t) => ({
              value: t,
              title: CHART_TYPE_LABELS[t],
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {CHART_TYPE_ICONS[t]}
                  <span className="hidden sm:inline">{CHART_TYPE_SHORT[t]}</span>
                </span>
              ),
            }))}
          />
        </div>
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
            <ComposedChart data={isCandles ? candles : points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="25%">
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
                // Candles are centred on their start time: leave half a candle of room at each edge.
                domain={isCandles ? [`dataMin - ${bucket * 0.6}`, `dataMax + ${bucket * 0.6}`] : ["dataMin", "dataMax"]}
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
              {isCandles ? (
                <Tooltip content={<CandleTooltip />} cursor={{ fill: "var(--color-line)", fillOpacity: 0.5 }} />
              ) : (
                <Tooltip
                  labelFormatter={(t: number) => fmtTooltipTime(t)}
                  formatter={(v: number) => [fmtUsd(v), "ETH/USD"]}
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ stroke: "var(--color-line-strong)", strokeDasharray: "3 3" }}
                />
              )}
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
              {chartType === "area" && (
                <Area type="linear" dataKey="price" stroke="var(--color-accent)" strokeWidth={2} fill="url(#priceFill)" isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }} />
              )}
              {chartType === "line" && (
                <Line type="linear" dataKey="price" stroke="var(--color-accent)" strokeWidth={2} isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }} />
              )}
              {isCandles && (
                <Bar
                  dataKey="range"
                  isAnimationActive={false}
                  shape={(props: unknown) => <CandleShape {...(props as CandleShapeProps)} variant={chartType as CandleVariant} />}
                />
              )}
              {isCandles ? (
                candles.length > 0 && <ReferenceLine y={candles[candles.length - 1].close} stroke="var(--color-accent)" strokeOpacity={0.6} strokeDasharray="2 3" />
              ) : (
                <ReferenceDot
                  x={points[points.length - 1].time}
                  y={points[points.length - 1].price}
                  ifOverflow="extendDomain"
                  shape={(props: { cx?: number; cy?: number }) => <LivePoint cx={props.cx ?? 0} cy={props.cy ?? 0} />}
                />
              )}
            </ComposedChart>
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

type CandleVariant = "candles" | "hollow" | "heikin" | "bars";
type CandleShapeProps = { x?: number; y?: number; width?: number; height?: number; payload?: Candle };

/**
 * One candle (or OHLC bar). Recharts draws the bar from low to high, so `y`/`height`
 * span the wick; open and close are placed inside that span.
 */
function CandleShape({ x = 0, y = 0, width = 0, height = 0, payload, variant }: CandleShapeProps & { variant: CandleVariant }) {
  if (!payload) return null;
  const { open, close, high, low } = payload;
  const span = high - low;
  const py = (v: number) => (span > 0 ? y + ((high - v) / span) * height : y);
  const up = close >= open;
  const color = up ? "var(--color-positive)" : "var(--color-negative)";
  const mid = x + width / 2;

  if (variant === "bars") {
    const tick = Math.max(2, width / 2);
    return (
      <g stroke={color} strokeWidth={Math.max(1, Math.min(2, width / 4))} strokeLinecap="square">
        <line x1={mid} x2={mid} y1={py(high)} y2={py(low)} />
        <line x1={mid - tick} x2={mid} y1={py(open)} y2={py(open)} />
        <line x1={mid} x2={mid + tick} y1={py(close)} y2={py(close)} />
      </g>
    );
  }

  const top = py(Math.max(open, close));
  const bodyH = Math.max(1, py(Math.min(open, close)) - top);
  const hollow = variant === "hollow" && up;
  return (
    <g stroke={color}>
      <line x1={mid} x2={mid} y1={py(high)} y2={py(low)} strokeWidth={1} />
      <rect x={x} y={top} width={Math.max(1, width)} height={bodyH} fill={hollow ? "var(--color-surface)" : color} strokeWidth={hollow ? 1.25 : 0} />
    </g>
  );
}

function CandleTooltip({ active, payload }: { active?: boolean; payload?: { payload: Candle }[] }) {
  const c = active ? payload?.[0]?.payload : undefined;
  if (!c) return null;
  const change = ((c.close - c.open) / c.open) * 100;
  return (
    // Same look as Recharts' default tooltip box, which supplies its own background and padding.
    <div style={{ ...TOOLTIP_STYLE, background: "var(--color-surface)", padding: 10 }}>
      <div className="mb-1 text-subtle">{fmtTooltipTime(c.time)}</div>
      <div className="grid grid-cols-[auto_auto] gap-x-3 tabular">
        <span className="text-subtle">Open</span>
        <span>{fmtUsd(c.open)}</span>
        <span className="text-subtle">High</span>
        <span>{fmtUsd(c.high)}</span>
        <span className="text-subtle">Low</span>
        <span>{fmtUsd(c.low)}</span>
        <span className="text-subtle">Close</span>
        <span>{fmtUsd(c.close)}</span>
        <span className="text-subtle">Change</span>
        <span className={change >= 0 ? "text-positive" : "text-negative"}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  line: "Line",
  area: "Area",
  candles: "Candles",
  hollow: "Hollow candles",
  heikin: "Heikin Ashi",
  bars: "OHLC bars",
};

const CHART_TYPE_SHORT: Record<ChartType, string> = { ...CHART_TYPE_LABELS, hollow: "Hollow", bars: "Bars" };

const icon = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

const CHART_TYPE_ICONS: Record<ChartType, ReactNode> = {
  line: icon(<path d="M1.5 11.5 5.5 7l3 3 6-6.5" />),
  area: icon(
    <>
      <path d="M1.5 11.5 5.5 7l3 3 6-6.5V14.5H1.5Z" fill="currentColor" fillOpacity={0.25} stroke="none" />
      <path d="M1.5 11.5 5.5 7l3 3 6-6.5" />
    </>,
  ),
  candles: icon(
    <>
      <path d="M4.5 1.5v13M11.5 2.5v11" />
      <rect x="2.75" y="4" width="3.5" height="7" rx="0.5" fill="currentColor" />
      <rect x="9.75" y="5.5" width="3.5" height="5" rx="0.5" fill="currentColor" />
    </>,
  ),
  hollow: icon(
    <>
      <path d="M4.5 1.5V4M4.5 11v3.5M11.5 2.5v11" />
      <rect x="2.75" y="4" width="3.5" height="7" rx="0.5" />
      <rect x="9.75" y="5.5" width="3.5" height="5" rx="0.5" fill="currentColor" />
    </>,
  ),
  heikin: icon(
    <>
      <path d="M3 4v9M8 3v9M13 1.5v9" />
      <rect x="1.75" y="6.5" width="2.5" height="5" rx="0.5" fill="currentColor" />
      <rect x="6.75" y="5" width="2.5" height="5" rx="0.5" fill="currentColor" />
      <rect x="11.75" y="3" width="2.5" height="5" rx="0.5" fill="currentColor" />
    </>,
  ),
  bars: icon(<path d="M5 2v12M2.5 5H5M5 10.5h2.5M11 3v10M8.5 11H11M11 5h2.5" />),
};
