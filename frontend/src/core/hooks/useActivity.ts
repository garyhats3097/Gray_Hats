import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import type { AbiEvent, Address, Hash } from "viem";
import { contracts, DEPLOY_BLOCK, MODULE_NAMES } from "../../config/contracts";

export type ActivityModule = "Core" | "Perpetuals" | "Lending";

export type ActivityItem = {
  hash: Hash;
  blockNumber: bigint;
  timestamp: number;
  module: ActivityModule;
  type: string;
  /** main amount shown in the table (18 decimals) */
  amount?: bigint;
  /** signed amount, e.g. realised PnL */
  signed?: bigint;
  /** secondary effects in the same transaction, e.g. "Locked $202.00" */
  details: { label: string; amount: bigint }[];
};

const eventsOf = (abi: readonly unknown[]) => abi.filter((x) => (x as { type: string }).type === "event") as AbiEvent[];
const ALL_EVENTS = [...eventsOf(contracts.vault.abi), ...eventsOf(contracts.perps.abi), ...eventsOf(contracts.lending.abi)];

/** Events that describe what the user did. Lower number = more important. */
const PRIMARY: Record<string, { type: string; module: ActivityModule; rank: number }> = {
  PositionOpened: { type: "Position opened", module: "Perpetuals", rank: 0 },
  PositionClosed: { type: "Position closed", module: "Perpetuals", rank: 0 },
  PositionLiquidated: { type: "Position liquidated", module: "Perpetuals", rank: 0 },
  Borrowed: { type: "Borrow", module: "Lending", rank: 0 },
  Repaid: { type: "Repay", module: "Lending", rank: 0 },
  Liquidated: { type: "Loan liquidated", module: "Lending", rank: 0 },
  CollateralAdded: { type: "Collateral allocated", module: "Lending", rank: 0 },
  CollateralRemoved: { type: "Collateral released", module: "Lending", rank: 0 },
  Deposited: { type: "Deposit", module: "Core", rank: 1 },
  Withdrawn: { type: "Withdraw", module: "Core", rank: 1 },
};

/** Vault effects shown as details under the primary action. */
const DETAIL_LABEL: Record<string, string> = {
  CollateralLocked: "Locked",
  CollateralUnlocked: "Released",
  LossRealized: "Paid to pool",
  ProfitRealized: "Profit received",
};

type DecodedLog = {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: Hash;
  blockNumber: bigint;
  logIndex: number;
};

/** Builds the user's history from contract events — real on-chain data only. */
export function useActivity() {
  const { address } = useAccount();
  const client = usePublicClient();

  return useQuery({
    queryKey: ["activity", address],
    enabled: !!address && !!client,
    queryFn: async (): Promise<ActivityItem[]> => {
      const logs = (await client!.getLogs({
        address: [contracts.vault.address, contracts.perps.address, contracts.lending.address],
        events: ALL_EVENTS,
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest",
      })) as unknown as DecodedLog[];

      const me = address!.toLowerCase();
      const mine = logs.filter((l) => {
        const a = l.args as { user?: Address; payer?: Address };
        return a.user?.toLowerCase() === me || a.payer?.toLowerCase() === me;
      });

      // Group by transaction: one row per transaction.
      const byTx = new Map<Hash, DecodedLog[]>();
      for (const l of mine) byTx.set(l.transactionHash, [...(byTx.get(l.transactionHash) ?? []), l]);

      const blockTimes = new Map<bigint, number>();
      const items: ActivityItem[] = [];
      for (const [hash, group] of byTx) {
        const primary = group
          .filter((l) => PRIMARY[l.eventName])
          .sort((a, b) => PRIMARY[a.eventName].rank - PRIMARY[b.eventName].rank)[0];

        const details = group
          .filter((l) => DETAIL_LABEL[l.eventName])
          .map((l) => {
            const moduleName = MODULE_NAMES[String(l.args.module).toLowerCase()];
            return { label: `${DETAIL_LABEL[l.eventName]}${moduleName ? ` · ${moduleName}` : ""}`, amount: l.args.amount as bigint };
          });

        const blockNumber = group[0].blockNumber;
        if (!blockTimes.has(blockNumber)) {
          const block = await client!.getBlock({ blockNumber });
          blockTimes.set(blockNumber, Number(block.timestamp));
        }

        const item: ActivityItem = {
          hash,
          blockNumber,
          timestamp: blockTimes.get(blockNumber)!,
          module: "Core",
          type: "Collateral update",
          details,
        };

        if (primary) {
          const meta = PRIMARY[primary.eventName];
          const a = primary.args;
          item.module = meta.module;
          item.type = meta.type;
          switch (primary.eventName) {
            case "PositionOpened":
              item.amount = a.size as bigint;
              item.type = `${a.isLong ? "Long" : "Short"} opened · ${a.leverage}x`;
              break;
            case "PositionClosed":
              item.signed = a.netSettlement as bigint;
              break;
            case "PositionLiquidated":
              item.signed = -(a.marginLost as bigint);
              break;
            case "Liquidated":
              item.amount = a.debtCleared as bigint;
              break;
            default:
              item.amount = a.amount as bigint;
          }
        } else if (details.length) {
          // A lock/unlock with no module-level event (should be rare)
          const moduleName = group.map((l) => MODULE_NAMES[String(l.args.module).toLowerCase()]).find(Boolean);
          item.module = (moduleName as ActivityModule) ?? "Core";
        }
        items.push(item);
      }

      return items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
    },
  });
}
