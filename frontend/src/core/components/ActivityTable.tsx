import { ArrowDownLeft, ArrowUpRight, CandlestickChart, HandCoins, Vault } from "lucide-react";
import type { ActivityItem } from "../hooks/useActivity";
import { fmtSignedUsd, fmtTime, fmtUsd, shortAddress, toNumber } from "../lib/format";
import { Badge, cx } from "./ui";

const MODULE_ICON = { Core: Vault, Perpetuals: CandlestickChart, Lending: HandCoins };

function AmountCell({ item }: { item: ActivityItem }) {
  if (item.signed !== undefined) {
    const n = toNumber(item.signed);
    return <span className={cx(n > 0 && "text-positive", n < 0 && "text-negative")}>{fmtSignedUsd(item.signed)}</span>;
  }
  if (item.amount !== undefined) {
    const out = item.type === "Withdraw" || item.type === "Borrow";
    return (
      <span className="inline-flex items-center gap-1">
        {item.type === "Deposit" && <ArrowDownLeft size={13} className="text-subtle" />}
        {out && <ArrowUpRight size={13} className="text-subtle" />}
        {fmtUsd(item.amount)}
      </span>
    );
  }
  return <span className="text-subtle">—</span>;
}

/** Confirmed on-chain activity. Scrolls horizontally on small screens. */
export function ActivityTable({ items, compact }: { items: ActivityItem[]; compact?: boolean }) {
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-xs text-subtle">
            <th className="px-5 py-2.5 font-medium sm:px-6">Action</th>
            <th className="px-3 py-2.5 font-medium">Module</th>
            <th className="px-3 py-2.5 text-right font-medium">Amount</th>
            {!compact && <th className="px-3 py-2.5 font-medium">Effects on collateral</th>}
            <th className="px-3 py-2.5 font-medium">Time</th>
            <th className="px-5 py-2.5 font-medium sm:px-6">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const Icon = MODULE_ICON[item.module];
            return (
              <tr key={item.hash} className="border-b border-line last:border-0">
                <td className="px-5 py-3 sm:px-6">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
                      <Icon size={15} />
                    </span>
                    <div>
                      <p className="font-medium text-ink">{item.type}</p>
                      <p className="font-mono text-[11px] text-subtle">{shortAddress(item.hash)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted">{item.module}</td>
                <td className="tabular px-3 py-3 text-right font-medium">
                  <AmountCell item={item} />
                </td>
                {!compact && (
                  <td className="px-3 py-3 text-xs text-muted">
                    {item.details.length ? item.details.map((d) => `${d.label} ${fmtUsd(d.amount)}`).join(" · ") : "—"}
                  </td>
                )}
                <td className="tabular px-3 py-3 whitespace-nowrap text-muted">{fmtTime(item.timestamp)}</td>
                <td className="px-5 py-3 sm:px-6">
                  <Badge tone="positive">Confirmed</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
