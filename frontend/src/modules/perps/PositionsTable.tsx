import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { contracts } from "../../config/contracts";
import { useTx } from "../../core/hooks/useTx";
import { Modal } from "../../core/components/Modal";
import { Badge, Button, Callout, KeyValue, cx } from "../../core/components/ui";
import { fmtSignedUsd, fmtUsd, toNumber } from "../../core/lib/format";
import { FEE_BPS, type PositionView } from "./hooks";

function Pnl({ value, margin }: { value?: bigint; margin: bigint }) {
  if (value === undefined) return <span className="text-subtle">—</span>;
  const n = toNumber(value);
  const roe = margin > 0n ? (n / toNumber(margin)) * 100 : 0;
  return (
    <span className={cx("inline-flex flex-col items-end whitespace-nowrap", n > 0 && "text-positive", n < 0 && "text-negative")}>
      {fmtSignedUsd(value)}
      <span className="text-[11px] font-normal opacity-80">{roe >= 0 ? "+" : ""}{roe.toFixed(1)}% on margin</span>
    </span>
  );
}

/** What closing would settle right now (the contract computes the real values). */
function settlementPreview(p: PositionView) {
  const pnl = p.pnl ?? 0n;
  const fee = (p.size * FEE_BPS) / 10_000n;
  const net = pnl - fee;
  const loss = net < 0n ? (-net > p.margin ? p.margin : -net) : 0n;
  const returned = net >= 0n ? p.margin + net : p.margin - loss;
  return { fee, net, returned, cappedLoss: net < 0n && -net > p.margin };
}

export function PositionsTable({ positions, price }: { positions: PositionView[]; price?: bigint }) {
  const { send, busy } = useTx();
  const [closing, setClosing] = useState<PositionView | null>(null);
  const preview = closing ? settlementPreview(closing) : null;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[13px]">
          <thead>
            <tr className="border-y border-line text-xs text-subtle">
              <th className="px-5 py-2.5 font-medium sm:px-6">Position</th>
              <th className="px-3 py-2.5 text-right font-medium">Size</th>
              <th className="px-3 py-2.5 text-right font-medium">Margin</th>
              <th className="px-3 py-2.5 text-right font-medium">Entry</th>
              <th className="px-3 py-2.5 text-right font-medium">Liq. price</th>
              <th className="px-3 py-2.5 text-right font-medium">P&L</th>
              <th className="px-5 py-2.5 text-right font-medium sm:px-6" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={String(p.id)} className={cx("border-b border-line last:border-0", p.liquidatable && "bg-negative-soft/50")}>
                <td className="px-5 py-3.5 sm:px-6">
                  <div className="flex items-center gap-2">
                    <Badge tone={p.isLong ? "positive" : "negative"}>
                      {p.isLong ? "Long" : "Short"} {String(p.leverage)}x
                    </Badge>
                    <span className="font-medium whitespace-nowrap">ETH/USD</span>
                    {p.liquidatable && (
                      <Badge tone="negative">
                        <AlertTriangle size={11} /> Liquidatable
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="tabular px-3 py-3.5 text-right">{fmtUsd(p.size)}</td>
                <td className="tabular px-3 py-3.5 text-right">{fmtUsd(p.margin)}</td>
                <td className="tabular px-3 py-3.5 text-right">{fmtUsd(p.entryPrice)}</td>
                <td className="tabular px-3 py-3.5 text-right text-warning">{p.liquidationPrice === undefined ? "—" : fmtUsd(p.liquidationPrice)}</td>
                <td className="tabular px-3 py-3.5 text-right font-semibold">
                  <Pnl value={p.pnl} margin={p.margin} />
                </td>
                <td className="px-5 py-3.5 text-right sm:px-6">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => setClosing(p)}>
                    Close
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!closing} onClose={() => setClosing(null)} title="Close position">
        {closing && preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge tone={closing.isLong ? "positive" : "negative"}>{closing.isLong ? "Long" : "Short"}</Badge>
              <span className="font-semibold">ETH/USD · {String(closing.leverage)}x</span>
            </div>
            <div className="divide-y divide-line rounded-xl bg-sunken/60 px-3.5">
              <KeyValue label="Size" value={fmtUsd(closing.size)} />
              <KeyValue label="Entry → mark price" value={`${fmtUsd(closing.entryPrice)} → ${price === undefined ? "—" : fmtUsd(price)}`} />
              <KeyValue label="Unrealized P&L" value={<Pnl value={closing.pnl} margin={closing.margin} />} />
              <KeyValue label="Closing fee (0.1%)" value={`−${fmtUsd(preview.fee)}`} />
              <KeyValue label="Net settlement" value={<span className={cx(preview.net > 0n && "text-positive", preview.net < 0n && "text-negative")}>{fmtSignedUsd(preview.net)}</span>} />
              <KeyValue label="Returned to available collateral" value={fmtUsd(preview.returned)} info="Your margin is unlocked, plus profit from the perps pool or minus the loss paid to it." />
            </div>
            {preview.cappedLoss && <Callout tone="warning">The loss is larger than this position's margin. You only lose the margin; the pool absorbs the rest.</Callout>}
            <p className="text-xs text-subtle">Final values are calculated by the contract at the price when the transaction is mined.</p>
            <Button
              className="w-full"
              size="lg"
              loading={busy}
              onClick={async () => {
                const ok = await send(`Close ${closing.isLong ? "long" : "short"} ${fmtUsd(closing.size)}`, "Perpetuals", {
                  ...contracts.perps,
                  functionName: "closePosition",
                  args: [closing.id],
                });
                if (ok) setClosing(null);
              }}
            >
              Confirm close
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
