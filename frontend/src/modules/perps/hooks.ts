import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { contracts, DEPLOY_BLOCK, ETH_USD } from "../../config/contracts";

export type PositionView = {
  id: bigint;
  isLong: boolean;
  size: bigint;
  margin: bigint;
  entryPrice: bigint;
  leverage: bigint;
  openedAt: bigint;
  pnl?: bigint;
  liquidationPrice?: bigint;
  liquidatable?: boolean;
};

/** Current ETH/USD oracle price (undefined if unavailable). */
export function useMarkPrice() {
  const { data, isError } = useReadContract({ ...contracts.oracle, functionName: "getPrice", args: [ETH_USD] });
  return { price: data as bigint | undefined, unavailable: isError };
}

/** Open positions for the given ids, with live PnL and liquidation price. */
export function useOpenPositions(ids: readonly bigint[]) {
  const { data, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: ids.flatMap((id) => [
      { ...contracts.perps, functionName: "getPosition", args: [id] } as const,
      { ...contracts.perps, functionName: "unrealizedPnl", args: [id] } as const,
      { ...contracts.perps, functionName: "liquidationPrice", args: [id] } as const,
      { ...contracts.perps, functionName: "isLiquidatable", args: [id] } as const,
    ]),
    query: { enabled: ids.length > 0 },
  });

  const positions: PositionView[] = [];
  ids.forEach((id, i) => {
    const p = data?.[i * 4]?.result as
      | { isOpen: boolean; isLong: boolean; size: bigint; margin: bigint; entryPrice: bigint; leverage: bigint; openedAt: bigint }
      | undefined;
    if (!p?.isOpen) return;
    positions.push({
      id,
      isLong: p.isLong,
      size: p.size,
      margin: p.margin,
      entryPrice: p.entryPrice,
      leverage: p.leverage,
      openedAt: p.openedAt,
      pnl: data?.[i * 4 + 1]?.result as bigint | undefined,
      liquidationPrice: data?.[i * 4 + 2]?.result as bigint | undefined,
      liquidatable: data?.[i * 4 + 3]?.result as boolean | undefined,
    });
  });

  return { positions: positions.reverse(), isLoading: ids.length > 0 && isLoading };
}

export type PricePoint = { time: number; price: number; block: bigint };

/** ETH/USD price history from the oracle's PriceUpdated events (real chain data). */
export function usePriceHistory() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["price-history", ETH_USD],
    enabled: !!client,
    queryFn: async (): Promise<PricePoint[]> => {
      const logs = await client!.getContractEvents({
        ...contracts.oracle,
        eventName: "PriceUpdated",
        args: { marketId: ETH_USD },
        fromBlock: DEPLOY_BLOCK,
      });
      return logs.map((l) => ({
        time: Number(l.args.timestamp),
        price: Number(l.args.price) / 1e18,
        block: l.blockNumber,
      }));
    },
  });
}

/** Perps pool liquidity: the module's reserve inside the CoreVault. */
export function usePerpsPool() {
  const { data } = useReadContract({ ...contracts.vault, functionName: "moduleReserve", args: [contracts.perps.address] });
  return data as bigint | undefined;
}

// ---- Prototype rules, mirrored from PerpsModule.sol for previews only.
// The contract re-checks everything; these numbers are never trusted on-chain.
export const MAX_LEVERAGE = 10;
export const FEE_BPS = 10n;
export const MAINT_BPS = 500n;
export const MIN_SIZE = 10n * 10n ** 18n;

export function quote(size: bigint, leverage: number, price: bigint | undefined, isLong: boolean) {
  const lev = BigInt(leverage);
  const margin = (size + lev - 1n) / lev;
  const fee = (size * FEE_BPS) / 10_000n;
  const maint = (size * MAINT_BPS) / 10_000n;
  let liquidationPrice: bigint | undefined;
  if (price !== undefined && size > 0n) {
    const move = margin > maint ? (price * (margin - maint)) / size : 0n;
    liquidationPrice = isLong ? (price > move ? price - move : 0n) : price + move;
  }
  return { margin, fee, total: margin + fee, liquidationPrice };
}

/** Largest size whose margin + fee fits in `free` at this leverage. */
export function maxSizeFor(free: bigint, leverage: number): bigint {
  const lev = BigInt(leverage);
  const max = (free * lev * 1000n) / (1000n + lev);
  return max > lev ? max - lev : 0n;
}

export type HistoryRange = "1D" | "7D" | "30D" | "1Y";
export type EthHistory = { updatedAt: number; sources: Partial<Record<HistoryRange, string>>; ranges: Partial<Record<HistoryRange, [number, number][]>> };

/** Real ETH price history saved by scripts/price-feed.mjs (Coinbase/Kraken/CoinGecko). */
export function useEthHistory() {
  return useQuery({
    queryKey: ["eth-history"],
    refetchInterval: 60_000,
    retry: false,
    queryFn: async (): Promise<EthHistory | null> => {
      const res = await fetch("/eth-history.json", { cache: "no-store" });
      if (!res.ok) return null;
      try {
        return (await res.json()) as EthHistory;
      } catch {
        return null;
      }
    },
  });
}

/** 24-hour change from the real 1D history and the current oracle price (percent). */
export function change24h(history: EthHistory | null | undefined, price: bigint | undefined): number | undefined {
  const first = history?.ranges["1D"]?.[0]?.[1];
  if (!first || price === undefined) return undefined;
  return ((Number(price) / 1e18 - first) / first) * 100;
}
