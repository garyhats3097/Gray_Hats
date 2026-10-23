import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseUnits, type Address } from "viem";
import { Clock, FlaskConical, Gavel, TrendingDown, TrendingUp } from "lucide-react";
import { contracts, DEPLOY_BLOCK, ETH_USD } from "../config/contracts";
import { useMarkPrice } from "../modules/perps/hooks";
import { useTx } from "../core/hooks/useTx";
import { useToast } from "../core/components/Toaster";
import { PageHeader } from "../core/components/PageHeader";
import { Badge, Button, Callout, Card, EmptyState, Spinner } from "../core/components/ui";
import { adminWallet, anvilTestClient } from "../core/lib/anvil";
import { friendlyError } from "../core/lib/errors";
import { fmtUsd, shortAddress } from "../core/lib/format";
import { fmtHealth } from "../core/components/HealthGauge";

const STEPS = [-10, -5, -1, 1, 5, 10];
const WARPS = [
  { label: "+1 day", seconds: 86_400 },
  { label: "+30 days", seconds: 30 * 86_400 },
  { label: "+1 year", seconds: 365 * 86_400 },
  { label: "+3 years", seconds: 3 * 365 * 86_400 },
];

/** Scans every position and borrower for things that can be liquidated right now. */
function useLiquidatable() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["liquidatable"],
    enabled: !!client,
    queryFn: async () => {
      const c = client!;
      const next = (await c.readContract({ ...contracts.perps, functionName: "nextPositionId" })) as bigint;
      const positions: { id: bigint; owner: Address; isLong: boolean; size: bigint; margin: bigint }[] = [];
      for (let id = 1n; id < next; id++) {
        const liq = await c.readContract({ ...contracts.perps, functionName: "isLiquidatable", args: [id] }).catch(() => false);
        if (!liq) continue;
        const p = await c.readContract({ ...contracts.perps, functionName: "getPosition", args: [id] });
        positions.push({ id, owner: p.owner, isLong: p.isLong, size: p.size, margin: p.margin });
      }

      const borrowLogs = await c.getContractEvents({ ...contracts.lending, eventName: "Borrowed", fromBlock: DEPLOY_BLOCK });
      const borrowers = [...new Set(borrowLogs.map((l) => l.args.user as Address))];
      const loans: { user: Address; debt: bigint; health: number }[] = [];
      for (const user of borrowers) {
        const [, debt, , health] = await c.readContract({ ...contracts.lending, functionName: "getLoan", args: [user] });
        if (debt > 0n && health < 10n ** 18n) loans.push({ user, debt, health: Number(health) / 1e18 });
      }
      return { positions, loans };
    },
  });
}

export default function DemoPage() {
  const { price } = useMarkPrice();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { send, busy } = useTx();
  const liquidatable = useLiquidatable();
  const [custom, setCustom] = useState("");
  const [working, setWorking] = useState(false);

  async function run(title: string, fn: () => Promise<unknown>) {
    setWorking(true);
    const id = toast.push({ kind: "pending", title, body: "Sending to local Anvil…" });
    try {
      await fn();
      await queryClient.invalidateQueries();
      toast.update(id, { kind: "success", body: "Done." });
    } catch (e) {
      toast.update(id, { kind: "error", body: `${friendlyError(e)} (Demo controls only work on a local Anvil node.)` });
    } finally {
      setWorking(false);
    }
  }

  const setPrice = (newPrice: bigint) =>
    run(`Set ETH/USD to ${fmtUsd(newPrice)}`, async () => {
      const hash = await adminWallet.writeContract({ ...contracts.oracle, functionName: "setPrice", args: [ETH_USD, newPrice] });
      await anvilTestClient.waitForTransactionReceipt({ hash });
    });

  const warp = (label: string, seconds: number) =>
    run(`Skip time ${label}`, async () => {
      await anvilTestClient.increaseTime({ seconds });
      await anvilTestClient.mine({ blocks: 1 });
    });

  const customPrice = Number(custom);
  const disabled = working || busy;

  return (
    <>
      <PageHeader title="Demo controls" subtitle="Presenter tools for the local prototype. They change the mock oracle and the local chain clock." />
      <div className="mb-5">
        <Callout tone="warning" icon={<FlaskConical size={14} className="text-warning" />}>
          <b>Testing tools only.</b> The price is set by the admin test account and time-travel uses Anvil's developer RPC. Neither exists on a real network.
        </Callout>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="ETH/USD mock price" info="Changes the MockOracle price. Open positions' P&L and liquidation status update immediately. If ./scripts/price-feed.sh is running, it replaces a manual price on its next update.">
          <p className="tabular text-3xl font-semibold tracking-tight">{price === undefined ? "—" : fmtUsd(price)}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {STEPS.map((pct) => (
              <Button
                key={pct}
                size="sm"
                variant="secondary"
                disabled={disabled || price === undefined}
                className={pct < 0 ? "text-negative" : "text-positive"}
                onClick={() => price !== undefined && setPrice((price * BigInt(100 + pct)) / 100n)}
              >
                {pct < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                {pct > 0 ? "+" : ""}
                {pct}%
              </Button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input
              inputMode="decimal"
              placeholder="Custom price, e.g. 2750"
              value={custom}
              onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setCustom(e.target.value)}
              className="tabular h-10 min-w-0 flex-1 rounded-xl border border-line-strong px-3 text-sm outline-none focus:border-accent"
            />
            <Button disabled={disabled || !(customPrice > 0)} onClick={() => setPrice(parseUnits(custom, 18))}>
              Set price
            </Button>
          </div>
        </Card>

        <Card title="Time travel" info="Moves the local chain's clock forward so lending interest accrues. Useful to demonstrate a lending liquidation.">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Clock size={16} /> Interest is 5% APR, so it takes years to change a health factor noticeably.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {WARPS.map((w) => (
              <Button key={w.label} size="sm" variant="secondary" disabled={disabled} onClick={() => warp(w.label, w.seconds)}>
                {w.label}
              </Button>
            ))}
          </div>
          <p className="mt-4 text-xs text-subtle">Tip: borrow close to the 75% limit, then skip 3 years — the health factor drops below 1.0.</p>
        </Card>
      </div>

      <Card title="Liquidations" className="mt-5" info="Anyone can liquidate an unhealthy position or loan. The connected wallet sends the transaction." action={<Gavel size={16} className="text-subtle" />}>
        {liquidatable.isLoading ? (
          <Spinner label="Scanning positions and loans…" />
        ) : !liquidatable.data || (liquidatable.data.positions.length === 0 && liquidatable.data.loans.length === 0) ? (
          <EmptyState title="Nothing to liquidate" body="Move the price against a leveraged position, or skip time on a loan near its limit." />
        ) : (
          <ul className="divide-y divide-line">
            {liquidatable.data.positions.map((p) => (
              <li key={`p${p.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="accent">Perpetuals</Badge>
                  <span className="font-medium">
                    #{String(p.id)} {p.isLong ? "Long" : "Short"} {fmtUsd(p.size)}
                  </span>
                  <span className="text-muted">owner {shortAddress(p.owner)} · margin {fmtUsd(p.margin)}</span>
                </div>
                <Button size="sm" variant="danger" disabled={disabled} onClick={() => send(`Liquidate position #${p.id}`, "Perpetuals", { ...contracts.perps, functionName: "liquidate", args: [p.id] })}>
                  Liquidate
                </Button>
              </li>
            ))}
            {liquidatable.data.loans.map((l) => (
              <li key={l.user} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="warning">Lending</Badge>
                  <span className="font-medium">Loan of {shortAddress(l.user)}</span>
                  <span className="text-muted">
                    debt {fmtUsd(l.debt)} · health {fmtHealth(l.health)}
                  </span>
                </div>
                <Button size="sm" variant="danger" disabled={disabled} onClick={() => send(`Liquidate loan of ${shortAddress(l.user)}`, "Lending", { ...contracts.lending, functionName: "liquidate", args: [l.user] })}>
                  Liquidate
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
