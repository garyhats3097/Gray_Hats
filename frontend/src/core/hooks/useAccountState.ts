import { useAccount, useReadContracts } from "wagmi";
import { contracts } from "../../config/contracts";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * Everything the app needs to know about the connected account, read in one batch.
 * All values come from the contracts — the frontend never keeps its own copy.
 */
export function useAccountState() {
  const { address } = useAccount();
  const user = address ?? ZERO;

  const { data, isLoading, isError, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...contracts.usdc, functionName: "balanceOf", args: [user] },
      { ...contracts.usdc, functionName: "allowance", args: [user, contracts.vault.address] },
      { ...contracts.vault, functionName: "deposits", args: [user] },
      { ...contracts.vault, functionName: "totalLocked", args: [user] },
      { ...contracts.vault, functionName: "freeCollateral", args: [user] },
      { ...contracts.vault, functionName: "lockedBy", args: [user, contracts.perps.address] },
      { ...contracts.vault, functionName: "lockedBy", args: [user, contracts.lending.address] },
      { ...contracts.perps, functionName: "totalUnrealizedPnl", args: [user] },
      { ...contracts.lending, functionName: "getLoan", args: [user] },
      { ...contracts.perps, functionName: "getUserPositionIds", args: [user] },
    ],
    query: { enabled: !!address },
  });

  const r = <T,>(i: number) => data?.[i]?.result as T | undefined;
  const loan = r<readonly [bigint, bigint, bigint, bigint]>(8);

  return {
    address,
    isLoading: !!address && isLoading,
    /** true only when the vault was actually read (false if the chain or contracts are unreachable) */
    loaded: data?.[2]?.status === "success",
    /** the vault answered but the Lending module's loan read reverted */
    loanReadFailed: data?.[2]?.status === "success" && data?.[8]?.status === "failure",
    isError,
    refetch,
    walletBalance: r<bigint>(0) ?? 0n,
    vaultAllowance: r<bigint>(1) ?? 0n,
    deposits: r<bigint>(2) ?? 0n,
    totalLocked: r<bigint>(3) ?? 0n,
    free: r<bigint>(4) ?? 0n,
    lockedPerps: r<bigint>(5) ?? 0n,
    lockedLending: r<bigint>(6) ?? 0n,
    /** undefined when the oracle price is unavailable */
    unrealizedPnl: r<bigint>(7),
    lendingCollateral: loan?.[0] ?? 0n,
    debt: loan?.[1] ?? 0n,
    borrowCapacity: loan?.[2] ?? 0n,
    /** null when there is no debt */
    healthFactor: loan === undefined || loan[1] === 0n ? null : Number(loan[3]) / 1e18,
    positionIds: r<readonly bigint[]>(9) ?? [],
  };
}

export type AccountState = ReturnType<typeof useAccountState>;
