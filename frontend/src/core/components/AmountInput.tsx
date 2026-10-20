import { fmtAmount } from "../lib/format";
import { cx } from "./ui";

/** Token amount field with a MAX button and the relevant balance underneath. */
export function AmountInput({
  label,
  value,
  onChange,
  max,
  maxLabel = "Available",
  symbol,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: bigint;
  maxLabel?: string;
  symbol: string;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-muted">{label}</label>
      <div
        className={cx(
          "flex items-center gap-2 rounded-xl border bg-surface px-3.5 py-2.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15",
          error ? "border-negative/60" : "border-line-strong",
        )}
      >
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (/^\d*\.?\d{0,18}$/.test(v)) onChange(v);
          }}
          className="tabular min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none placeholder:text-subtle disabled:opacity-60"
        />
        <span className="text-sm font-medium text-muted">{symbol}</span>
        {max !== undefined && (
          <button
            type="button"
            disabled={disabled || max === 0n}
            onClick={() => onChange(trimZeros(max))}
            className="rounded-md px-2 py-1 text-xs font-semibold text-accent hover:bg-accent-soft disabled:opacity-40"
          >
            MAX
          </button>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="text-negative">{error}</span>
        {max !== undefined && (
          <span className="tabular text-subtle">
            {maxLabel}: {fmtAmount(max)} {symbol}
          </span>
        )}
      </div>
    </div>
  );
}

/** Exact decimal string of an 18-decimal bigint, without trailing zeros. */
function trimZeros(value: bigint): string {
  const whole = value / 10n ** 18n;
  const frac = (value % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
