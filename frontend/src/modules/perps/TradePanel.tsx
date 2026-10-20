import { useState } from "react";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { contracts, ETH_USD, COLLATERAL_SYMBOL } from "../../config/contracts";
import { useAccountState } from "../../core/hooks/useAccountState";
import { useTx } from "../../core/hooks/useTx";
import { AmountInput } from "../../core/components/AmountInput";
import { Button, Callout, KeyValue, cx } from "../../core/components/ui";
import { fmtUsd, parseAmount } from "../../core/lib/format";
import { MAX_LEVERAGE, MIN_SIZE, maxSizeFor, quote, useMarkPrice } from "./hooks";

const LEVERAGE_MARKS = [1, 2, 3, 5, 10];

export function TradePanel() {
  const s = useAccountState();
  const { price, unavailable } = useMarkPrice();
  const { send, busy } = useTx();
  const [isLong, setIsLong] = useState(true);
  const [input, setInput] = useState("");
  const [leverage, setLeverage] = useState(5);

  const size = parseAmount(input);
  const q = quote(size ?? 0n, leverage, price, isLong);
  const maxSize = maxSizeFor(s.free, leverage);

  let error: string | null = null;
  if (input && size === null) error = "Enter a valid size";
  else if (size !== null && size < MIN_SIZE) error = "Minimum size is $10";
  else if (size !== null && q.total > s.free) error = "Not enough available collateral";

  const ready = size !== null && !error && !unavailable && !busy;

  async function open() {
    if (size === null) return;
    const ok = await send(`Open ${isLong ? "long" : "short"} ${fmtUsd(size)} · ${leverage}x`, "Perpetuals", {
      ...contracts.perps,
      functionName: "openPosition",
      args: [ETH_USD, isLong, size, BigInt(leverage)],
    });
    if (ok) setInput("");
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1">
        {[true, false].map((long) => (
          <button
            key={String(long)}
            onClick={() => setIsLong(long)}
            className={cx(
              "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors",
              isLong === long
                ? long
                  ? "bg-positive text-white shadow-sm"
                  : "bg-negative text-white shadow-sm"
                : "text-muted hover:text-ink",
            )}
          >
            {long ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {long ? "Long" : "Short"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5 text-sm">
        <span className="text-muted">Market</span>
        <span className="font-semibold">ETH/USD</span>
      </div>

      <AmountInput
        label="Position size (USD)"
        value={input}
        onChange={setInput}
        max={maxSize}
        maxLabel="Max at this leverage"
        symbol="USD"
        error={error}
        disabled={busy}
      />

      <div>
        <div className="mb-2 flex items-center justify-between text-[13px]">
          <span className="font-medium text-muted">Leverage</span>
          <span className="tabular rounded-md bg-sunken px-2 py-0.5 font-semibold">{leverage}x</span>
        </div>
        <input
          type="range"
          min={1}
          max={MAX_LEVERAGE}
          step={1}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="w-full accent-[var(--color-accent)]"
          aria-label="Leverage"
        />
        <div className="mt-1 flex justify-between">
          {LEVERAGE_MARKS.map((m) => (
            <button key={m} onClick={() => setLeverage(m)} className={cx("text-xs", leverage === m ? "font-semibold text-accent" : "text-subtle hover:text-ink")}>
              {m}x
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-line rounded-xl bg-sunken/60 px-3.5">
        <KeyValue label="Entry price (mock oracle)" value={price === undefined ? "—" : fmtUsd(price)} />
        <KeyValue label="Required margin" value={fmtUsd(q.margin)} info="Size ÷ leverage. Locked in the shared vault while the position is open." />
        <KeyValue label="Opening fee (0.1%)" value={fmtUsd(q.fee)} />
        <KeyValue label="Total from available" value={`${fmtUsd(q.total)} / ${fmtUsd(s.free)}`} />
        <KeyValue
          label="Est. liquidation price"
          value={size && q.liquidationPrice !== undefined ? fmtUsd(q.liquidationPrice) : "—"}
          info="Price at which remaining margin falls to 5% of size. The position can then be liquidated and its margin goes to the pool."
        />
      </div>

      {unavailable && <Callout tone="negative">The oracle has no price for ETH/USD, so trading is paused.</Callout>}
      {leverage >= 5 && size !== null && !error && (
        <Callout tone="warning" icon={<AlertTriangle size={14} className="text-warning" />}>
          At {leverage}x, a {(100 / leverage - 5).toFixed(1)}% move against you can liquidate this position and you lose its margin.
        </Callout>
      )}
      {s.free === 0n && (
        <Callout>You have no available collateral. Deposit {COLLATERAL_SYMBOL} in the Shared Vault first.</Callout>
      )}

      <Button
        className={cx("w-full", isLong ? "!bg-positive hover:!bg-positive/90" : "!bg-negative hover:!bg-negative/90")}
        size="lg"
        disabled={!ready}
        loading={busy}
        onClick={open}
      >
        {size === null ? "Enter a size" : `Open ${isLong ? "Long" : "Short"}`}
      </Button>
      <p className="text-center text-[11px] text-subtle">Prototype: simplified perpetuals, no funding rate, mock price.</p>
    </div>
  );
}
