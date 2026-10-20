import { useAccount, useReadContracts } from "wagmi";
import { contracts } from "../../config/contracts";

// ---- Prototype rules, mirrored from LendingModule.sol for previews only.
export const LTV_BPS = 7_500n;
export const LIQ_THRESHOLD_BPS = 8_500n;
export const LIQ_PENALTY_BPS = 500n;
export const APR_PCT = 5;

/** Health factor for a given collateral and debt; null when there is no debt. */
export function healthFor(collateral: bigint, debt: bigint): number | null {
  if (debt <= 0n) return null;
  return Number((collateral * LIQ_THRESHOLD_BPS * 10n ** 18n) / (10_000n * debt)) / 1e18;
}

/** Smallest collateral that still allows `debt` under the 75% LTV rule. */
export function requiredCollateral(debt: bigint): bigint {
  return (debt * 10_000n + LTV_BPS - 1n) / LTV_BPS;
}

/** Debt level at which this collateral becomes liquidatable. */
export function liquidationDebt(collateral: bigint): bigint {
  return (collateral * LIQ_THRESHOLD_BPS) / 10_000n;
}

/** Pool liquidity and the user's mUSDC allowance for repayments. */
export function useLendingMarket() {
  const { address } = useAccount();
  const { data } = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...contracts.vault, functionName: "moduleReserve", args: [contracts.lending.address] },
      { ...contracts.usdc, functionName: "allowance", args: [address ?? "0x0000000000000000000000000000000000000000", contracts.lending.address] },
    ],
    query: { enabled: !!address },
  });
  return {
    poolLiquidity: data?.[0]?.result as bigint | undefined,
    repayAllowance: (data?.[1]?.result as bigint | undefined) ?? 0n,
  };
}
