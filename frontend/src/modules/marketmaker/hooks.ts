import { useQuery } from "@tanstack/react-query";
import { useAccount, useBlockNumber, useBytecode, usePublicClient, useReadContracts } from "wagmi";
import type { AbiEvent, Address, Hash } from "viem";
import { anvilLocal } from "../../config/chain";
import { contracts, DEPLOY_BLOCK, ETH_USD } from "../../config/contracts";

/** Mirrors MarketMakerModule's status codes. */
export const QUOTE_STATUS = { OK: 0, PAUSED: 1, NOT_LISTED: 2, ORACLE_UNAVAILABLE: 3 } as const;

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const mm = contracts.marketMaker;

export type Quote = { mid: bigint; bid: bigint; ask: bigint; spreadBps: bigint };

/** Everything the Market Maker page shows, read from the contracts in one batch. */
export function useMarketMaker() {
  const { address } = useAccount();
  const { data: code, isLoading: codeLoading } = useBytecode({ address: mm.address, chainId: anvilLocal.id });
  const deployed = !!code && code !== "0x";

  const { data, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...mm, functionName: "quoteStatus", args: [ETH_USD] },
      { ...mm, functionName: "liquidity", args: [ETH_USD] },
      { ...mm, functionName: "markets", args: [ETH_USD] },
      { ...mm, functionName: "quotingEnabled" },
      { ...mm, functionName: "MIN_SPREAD_BPS" },
      { ...mm, functionName: "MAX_SPREAD_BPS" },
      { ...mm, functionName: "owner" },
      { ...mm, functionName: "isOperator", args: [address ?? ZERO] },
      { ...contracts.oracle, functionName: "prices", args: [ETH_USD] },
    ],
    query: { enabled: deployed },
  });
  const r = <T,>(i: number) => data?.[i]?.result as T | undefined;

  const status = r<readonly [number, Quote]>(0);
  const liq = r<readonly [bigint, bigint, bigint, bigint]>(1);
  const market = r<readonly [boolean, bigint, bigint]>(2);
  const owner = r<Address>(6);
  const oraclePrice = r<readonly [bigint, bigint]>(8);

  return {
    deployed,
    isLoading: codeLoading || (deployed && isLoading),
    status: status?.[0],
    quote: status && status[0] === QUOTE_STATUS.OK ? status[1] : undefined,
    funded: liq?.[0],
    bidSide: liq?.[1],
    askSide: liq?.[2],
    indicativeSize: liq?.[3],
    spreadBps: market?.[1],
    maxQuoteSize: market?.[2],
    quotingEnabled: r<boolean>(3),
    minSpread: r<bigint>(4),
    maxSpread: r<bigint>(5),
    canConfigure: !!address && (r<boolean>(7) === true || owner?.toLowerCase() === address.toLowerCase()),
    referencePrice: oraclePrice?.[0],
    priceUpdatedAt: oraclePrice ? Number(oraclePrice[1]) : undefined,
  };
}

export type MMEvent = {
  hash: Hash;
  blockNumber: bigint;
  timestamp: number;
  name: string;
  args: Record<string, unknown>;
};

/** Module-wide history: listing, spread and size changes, pause/resume, published quotes. */
export function useMarketMakerHistory(enabled: boolean) {
  const client = usePublicClient();
  const { data: latest } = useBlockNumber({ watch: true });
  return useQuery({
    queryKey: ["mm-history", String(latest)],
    enabled: enabled && !!client,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<MMEvent[]> => {
      const events = (mm.abi as readonly { type: string }[]).filter((x) => x.type === "event") as AbiEvent[];
      const logs = (await client!.getLogs({ address: mm.address, events, fromBlock: DEPLOY_BLOCK })) as unknown as {
        eventName: string;
        args: Record<string, unknown>;
        transactionHash: Hash;
        blockNumber: bigint;
      }[];
      const times = new Map<bigint, number>();
      for (const l of logs) {
        if (!times.has(l.blockNumber)) times.set(l.blockNumber, Number((await client!.getBlock({ blockNumber: l.blockNumber })).timestamp));
      }
      return logs
        .map((l) => ({ hash: l.transactionHash, blockNumber: l.blockNumber, timestamp: times.get(l.blockNumber)!, name: l.eventName, args: l.args }))
        .reverse();
    },
  });
}
