import { useReadContract, useReadContracts } from "wagmi";
import { contracts, ETH_USD } from "../../config/contracts";

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
