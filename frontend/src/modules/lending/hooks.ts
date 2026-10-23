import { useAccount, useReadContracts } from "wagmi";
import { contracts } from "../../config/contracts";

export const LIQ_PENALTY_BPS = 500n;
export const APR_PCT = 5;

/** Credit tiers, mirrored from CreditRegistry.sol for display only — the contract decides. */
export const TIERS = [
  { id: 0, name: "Standard", minScore: 0, ltvPct: 75, liqPct: 85 },
  { id: 1, name: "Trusted", minScore: 40, ltvPct: 90, liqPct: 95 },
  { id: 2, name: "Established", minScore: 70, ltvPct: 100, liqPct: 105 },
  { id: 3, name: "Prime", minScore: 85, ltvPct: 120, liqPct: 125 },
] as const;

/** Health factor for a collateral/debt pair at a liquidation threshold; null when no debt. */
export function healthFor(collateral: bigint, debt: bigint, thresholdBps: bigint): number | null {
  if (debt <= 0n) return null;
  return Number((collateral * thresholdBps * 10n ** 18n) / (10_000n * debt)) / 1e18;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** Pool liquidity and the user's mUSDC allowance for repayments. */
export function useLendingMarket() {
  const { address } = useAccount();
  const { data } = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...contracts.vault, functionName: "moduleReserve", args: [contracts.lending.address] },
      { ...contracts.usdc, functionName: "allowance", args: [address ?? ZERO, contracts.lending.address] },
    ],
    query: { enabled: !!address },
  });
  return {
    poolLiquidity: data?.[0]?.result as bigint | undefined,
    repayAllowance: (data?.[1]?.result as bigint | undefined) ?? 0n,
  };
}

export type CreditTerms = {
  tier: number;
  score: bigint;
  maxLtvBps: bigint;
  liquidationThresholdBps: bigint;
  unsecuredAllowance: bigint;
  defaulted: boolean;
};
export type CreditBreakdown = { loansPoints: bigint; volumePoints: bigint; agePoints: bigint; portfolioPoints: bigint; penaltyPoints: bigint };
export type CreditRecord = { firstSeen: bigint; loansRepaid: number; perpsLiquidations: number; lendingDefaults: number; repaidVolume: bigint };

/** The connected user's on-chain credit profile and the lending limits it produces. */
export function useCredit() {
  const { address } = useAccount();
  const user = address ?? ZERO;
  const { data, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...contracts.credit, functionName: "termsOf", args: [user] },
      { ...contracts.credit, functionName: "scoreOf", args: [user] },
      { ...contracts.credit, functionName: "recordOf", args: [user] },
      { ...contracts.lending, functionName: "liquidationThresholdOf", args: [user] },
      { ...contracts.lending, functionName: "maxRemovable", args: [user] },
      { ...contracts.lending, functionName: "borrowLimit", args: [user] },
      { ...contracts.lending, functionName: "poolUnsecuredRoom", args: [user] },
      { ...contracts.lending, functionName: "totalBadDebt" },
    ],
    query: { enabled: !!address },
  });
  const r = <T,>(i: number) => data?.[i]?.result as T | undefined;
  const score = r<readonly [bigint, CreditBreakdown]>(1);
  return {
    isLoading: !!address && isLoading,
    terms: r<CreditTerms>(0),
    breakdown: score?.[1],
    record: r<CreditRecord>(2),
    /** threshold of the current loan (or of a new loan if none) */
    loanThresholdBps: r<bigint>(3),
    maxRemovable: r<bigint>(4),
    borrowLimit: r<bigint>(5),
    poolUnsecuredRoom: r<bigint>(6),
    totalBadDebt: r<bigint>(7),
  };
}
