import { fmtUsd, toNumber } from "../lib/format";

export type AllocationSegment = { key: string; label: string; value: bigint; color: string };

/**
 * Stacked bar showing how deposited collateral is split. Segments are parts of ONE
 * total (deposits), so they never double-count. The legend repeats every value, so
 * identity never relies on colour alone.
 */
export function AllocationBar({ segments, total }: { segments: AllocationSegment[]; total: bigint }) {
  const t = toNumber(total);
  const visible = segments.filter((s) => s.value > 0n);

  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-sunken" role="img" aria-label="Collateral allocation">
        {t > 0 &&
          visible.map((s) => (
            <div
              key={s.key}
              title={`${s.label}: ${fmtUsd(s.value)} (${((toNumber(s.value) / t) * 100).toFixed(1)}%)`}
              className="h-full first:rounded-l-full last:rounded-r-full transition-[width] duration-500"
              style={{ width: `${(toNumber(s.value) / t) * 100}%`, background: s.color, minWidth: 4 }}
            />
          ))}
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {segments.map((s) => (
          <li key={s.key} className="flex items-start gap-2.5">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
            <div>
              <div className="text-[13px] text-muted">{s.label}</div>
              <div className="tabular text-[15px] font-semibold text-ink">
                {fmtUsd(s.value)}
                <span className="ml-1.5 text-xs font-normal text-subtle">
                  {t > 0 ? `${((toNumber(s.value) / t) * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
