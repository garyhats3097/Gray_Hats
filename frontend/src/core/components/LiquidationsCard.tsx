import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { Gavel } from "lucide-react";
import { contracts, DEPLOY_BLOCK } from "../../config/contracts";
import { useTx } from "../hooks/useTx";
import { fmtUsd, shortAddress } from "../lib/format";
import { fmtHealth } from "./HealthGauge";
import { Badge, Button, Card, EmptyState, Spinner } from "./ui";

/** Scans every position and borrower for anything that can be liquidated right now. */
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

/**
 * Real liquidations: positions and loans that became unhealthy because of real price moves or
 * accrued interest. Anyone may liquidate; the connected wallet sends the transaction.
 */
export function LiquidationsCard({ className }: { className?: string }) {
  const liquidatable = useLiquidatable();
  const { send, busy } = useTx();
  const empty = !liquidatable.data || (liquidatable.data.positions.length === 0 && liquidatable.data.loans.length === 0);

  return (
    <Card
      title="Liquidations"
      className={className}
      info="Positions and loans that are unhealthy right now. Anyone can liquidate them; the connected wallet sends the transaction."
      action={<Gavel size={16} className="text-subtle" />}
    >
      {liquidatable.isLoading ? (
        <Spinner label="Scanning positions and loans…" />
      ) : empty ? (
        <EmptyState title="Nothing to liquidate" body="Everything is healthy at the current real ETH price." />
      ) : (
        <ul className="divide-y divide-line">
          {liquidatable.data!.positions.map((p) => (
            <li key={`p${p.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="accent">Perpetuals</Badge>
                <span className="font-medium">
                  #{String(p.id)} {p.isLong ? "Long" : "Short"} {fmtUsd(p.size)}
                </span>
                <span className="text-muted">
                  owner {shortAddress(p.owner)} · margin {fmtUsd(p.margin)}
                </span>
              </div>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => send(`Liquidate position #${p.id}`, "Perpetuals", { ...contracts.perps, functionName: "liquidate", args: [p.id] })}>
                Liquidate
              </Button>
            </li>
          ))}
          {liquidatable.data!.loans.map((l) => (
            <li key={l.user} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="warning">Lending</Badge>
                <span className="font-medium">Loan of {shortAddress(l.user)}</span>
                <span className="text-muted">
                  debt {fmtUsd(l.debt)} · health {fmtHealth(l.health)}
                </span>
              </div>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => send(`Liquidate loan of ${shortAddress(l.user)}`, "Lending", { ...contracts.lending, functionName: "liquidate", args: [l.user] })}>
                Liquidate
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
