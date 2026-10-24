import { useEffect, useState } from "react";
import { fmtUsd, toNumber } from "../lib/format";
import { Ticker, cx } from "./ui";

export type AllocationSegment = { key: string; label: string; value: bigint; color: string };

/**
 * Stacked bar showing how deposited collateral is split. Segments are parts of ONE
 * total (deposits), so they never double-count. The legend repeats every value, so
 * identity never relies on colour alone. Hovering a segment or legend row highlights both.
 */
export function AllocationBar({ segments, total }: { segments: AllocationSegment[]; total: bigint }) {
  const t = toNumber(total);
  const visible = segments.filter((s) => s.value > 0n);
  const [hovered, setHovered] = useState<string | null>(null);
  // Start at zero width and grow on first paint.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div onMouseLeave={() => setHovered(null)}>
      <div className="flex h-3.5 w-full items-center gap-[2px] rounded-full bg-sunken" role="img" aria-label="Collateral allocation">
        {t > 0 &&
          visible.map((s, i) => (
            <div
              key={s.key}
              title={`${s.label}: ${fmtUsd(s.value)} (${((toNumber(s.value) / t) * 100).toFixed(1)}%)`}
              onMouseEnter={() => setHovered(s.key)}
              className={cx(
                "h-full first:rounded-l-full last:rounded-r-full",
                hovered === s.key && "scale-y-[1.5]",
                hovered && hovered !== s.key && "opacity-40",
              )}
              style={{
                width: filled ? `${(toNumber(s.value) / t) * 100}%` : "0%",
                minWidth: filled ? 4 : 0,
                background: s.color,
                transition: `width 0.8s var(--ease-out) ${i * 90}ms, min-width 0.8s, transform 0.2s var(--ease-out), opacity 0.2s`,
              }}
            />
          ))}
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {segments.map((s) => (
          <li
            key={s.key}
            onMouseEnter={() => setHovered(s.key)}
            className={cx(
              "-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-[background-color,opacity] duration-200",
              hovered === s.key && "bg-sunken",
              hovered && hovered !== s.key && "opacity-50",
            )}
          >
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
            <div>
              <div className="text-[13px] text-muted">{s.label}</div>
              <div className="display text-[18px] leading-tight font-medium text-ink">
                <Ticker value={fmtUsd(s.value)} />
                <span className="ml-1.5 font-sans text-xs font-normal text-subtle">
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
