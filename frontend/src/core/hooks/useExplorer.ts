import { useQuery } from "@tanstack/react-query";
import { useBlockNumber, usePublicClient, useReadContracts } from "wagmi";
import type { Address, Hash, Hex, Log } from "viem";
import { contracts, DEPLOY_BLOCK } from "../../config/contracts";

export type ExplorerTx = {
  hash: Hash;
  blockNumber: bigint;
  timestamp: number;
  from: Address;
  to: Address | null;
  input: Hex;
  status: "success" | "reverted";
  gasUsed: bigint;
  contractAddress?: Address | null;
  logs: Log[];
};

export type ExplorerBlock = {
  number: bigint;
  timestamp: number;
  gasUsed: bigint;
  txCount: number;
};

/** The most recent blocks and all their transactions (with receipts). */
export function useRecentChain(blockCount = 30) {
  const client = usePublicClient();
  const { data: latest } = useBlockNumber({ watch: true });

  return useQuery({
    queryKey: ["explorer-chain", String(latest), blockCount],
    enabled: !!client && latest !== undefined,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const c = client!;
      const first = latest! - BigInt(blockCount) + 1n > 0n ? latest! - BigInt(blockCount) + 1n : 0n;
      const numbers: bigint[] = [];
      for (let n = latest!; n >= first; n--) numbers.push(n);

      const blocks = await Promise.all(numbers.map((n) => c.getBlock({ blockNumber: n, includeTransactions: true })));
      const txs: ExplorerTx[] = [];
      for (const b of blocks) {
        const receipts = await Promise.all(b.transactions.map((t) => c.getTransactionReceipt({ hash: t.hash })));
        b.transactions.forEach((t, i) => {
          const r = receipts[i];
          txs.push({
            hash: t.hash,
            blockNumber: b.number!,
            timestamp: Number(b.timestamp),
            from: t.from,
            to: t.to ?? null,
            input: t.input,
            status: r.status,
            gasUsed: r.gasUsed,
            contractAddress: r.contractAddress,
            logs: r.logs,
          });
        });
      }
      const blockRows: ExplorerBlock[] = blocks.map((b) => ({
        number: b.number!,
        timestamp: Number(b.timestamp),
        gasUsed: b.gasUsed,
        txCount: b.transactions.length,
      }));
      return { latest: latest!, blocks: blockRows, txs };
    },
  });
}

/** Protocol-wide numbers straight from the contracts. */
export function useProtocolState() {
  const { data } = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...contracts.usdc, functionName: "balanceOf", args: [contracts.vault.address] },
      { ...contracts.vault, functionName: "totalDeposits" },
      { ...contracts.vault, functionName: "totalReserves" },
      { ...contracts.vault, functionName: "moduleReserve", args: [contracts.perps.address] },
      { ...contracts.vault, functionName: "moduleReserve", args: [contracts.lending.address] },
      { ...contracts.vault, functionName: "isSolvent" },
      { ...contracts.perps, functionName: "nextPositionId" },
      { ...contracts.registry, functionName: "getModules" },
    ],
  });
  const r = <T,>(i: number) => data?.[i]?.result as T | undefined;
  return {
    vaultBalance: r<bigint>(0),
    totalDeposits: r<bigint>(1),
    totalReserves: r<bigint>(2),
    perpsPool: r<bigint>(3),
    lendingPool: r<bigint>(4),
    solvent: r<boolean>(5),
    positionsOpened: r<bigint>(6) === undefined ? undefined : r<bigint>(6)! - 1n,
    modules: r<readonly Address[]>(7),
  };
}

export type UserRow = {
  address: Address;
  deposits: bigint;
  free: bigint;
  lockedPerps: bigint;
  lockedLending: bigint;
  debt: bigint;
  health: number | null;
};

/** Every address that has ever deposited, with its current position — the multi-user view. */
export function useAllUsers() {
  const client = usePublicClient();
  const { data: latest } = useBlockNumber({ watch: true });
  return useQuery({
    queryKey: ["explorer-users", String(latest)],
    enabled: !!client,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<UserRow[]> => {
      const c = client!;
      const logs = await c.getContractEvents({ ...contracts.vault, eventName: "Deposited", fromBlock: DEPLOY_BLOCK });
      const users = [...new Set(logs.map((l) => (l.args.user as Address).toLowerCase()))] as Address[];
      return Promise.all(
        users.map(async (u) => {
          const [deposits, free, lockedPerps, lockedLending, loan] = await Promise.all([
            c.readContract({ ...contracts.vault, functionName: "deposits", args: [u] }),
            c.readContract({ ...contracts.vault, functionName: "freeCollateral", args: [u] }),
            c.readContract({ ...contracts.vault, functionName: "lockedBy", args: [u, contracts.perps.address] }),
            c.readContract({ ...contracts.vault, functionName: "lockedBy", args: [u, contracts.lending.address] }),
            c.readContract({ ...contracts.lending, functionName: "getLoan", args: [u] }),
          ]);
          const debt = loan[1];
          return {
            address: u,
            deposits,
            free,
            lockedPerps,
            lockedLending,
            debt,
            health: debt === 0n ? null : Number(loan[3]) / 1e18,
          };
        }),
      );
    },
  });
}
