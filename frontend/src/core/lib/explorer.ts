import { decodeEventLog, decodeFunctionData, formatUnits, type Abi, type Address, type Hex, type Log } from "viem";
import { contracts, ADMIN_ADDRESS, ETH_USD } from "../../config/contracts";

/** Our contracts, keyed by lower-cased address. */
const CONTRACTS: { name: string; role: string; address: Address; abi: Abi }[] = [
  { name: "CoreVault", role: "Holds all collateral; the shared ledger", ...contracts.vault },
  { name: "ModuleRegistry", role: "Allow-list of modules that may use the vault", ...contracts.registry },
  { name: "CreditRegistry", role: "Shared on-chain credit history and scores", ...contracts.credit },
  { name: "PerpsModule", role: "Perpetual futures rules", ...contracts.perps },
  { name: "LendingModule", role: "Borrowing and repayment rules", ...contracts.lending },
  { name: "MarketMakerModule", role: "Indicative bid/ask quotes (stub)", ...contracts.marketMaker },
  { name: "MockOracle", role: "Test price feed (admin-controlled)", ...contracts.oracle },
  { name: "mUSDC", role: "Test collateral token (anyone can mint)", ...contracts.usdc },
].map((c) => ({ ...c, abi: c.abi as Abi }));

const BY_ADDRESS = new Map(CONTRACTS.map((c) => [c.address.toLowerCase(), c]));

/** Anvil's built-in test accounts (public keys — local use only). */
const KNOWN_ACCOUNTS: Record<string, string> = {
  [ADMIN_ADDRESS.toLowerCase()]: "Admin (Anvil #0)",
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": "Test account #1",
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc": "Test account #2",
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906": "Test account #3",
};

export const CONTRACT_DIRECTORY = CONTRACTS;

/** A friendly name for an address, or undefined if we don't know it. */
export function labelFor(address: string | null | undefined, me?: string): string | undefined {
  if (!address) return undefined;
  const a = address.toLowerCase();
  if (me && a === me.toLowerCase()) return "You";
  return BY_ADDRESS.get(a)?.name ?? KNOWN_ACCOUNTS[a];
}

export function isContract(address: string | null | undefined) {
  return !!address && BY_ADDRESS.has(address.toLowerCase());
}

export type DecodedCall = { method: string; args: { name: string; value: string }[] };

/** Turn a transaction's input data into "functionName(args)" using our ABIs. */
export function decodeCall(to: Address | null, input: Hex, me?: string): DecodedCall {
  if (!to) return { method: "Contract deployment", args: [] };
  const c = BY_ADDRESS.get(to.toLowerCase());
  if (!input || input === "0x") return { method: "ETH transfer", args: [] };
  if (!c) return { method: input.slice(0, 10), args: [] };
  try {
    const { functionName, args } = decodeFunctionData({ abi: c.abi, data: input });
    const fn = c.abi.find((x) => x.type === "function" && x.name === functionName) as { inputs: { name: string }[] } | undefined;
    return {
      method: functionName,
      args: (args ?? []).map((v, i) => ({ name: fn?.inputs[i]?.name || `arg${i}`, value: formatValue(v, me) })),
    };
  } catch {
    return { method: input.slice(0, 10), args: [] };
  }
}

export type DecodedEvent = { contract: string; name: string; args: { name: string; value: string }[] };

/** Decode logs emitted by our contracts. */
export function decodeLogs(logs: readonly Log[], me?: string): DecodedEvent[] {
  return logs.map((log) => {
    const c = BY_ADDRESS.get(log.address.toLowerCase());
    if (!c) return { contract: log.address, name: "Unknown event", args: [] };
    try {
      const ev = decodeEventLog({ abi: c.abi, data: log.data, topics: log.topics });
      const args = ev.args && typeof ev.args === "object" && !Array.isArray(ev.args) ? Object.entries(ev.args) : [];
      return { contract: c.name, name: ev.eventName ?? "Event", args: args.map(([name, v]) => ({ name, value: formatValue(v, me) })) };
    } catch {
      return { contract: c.name, name: "Unknown event", args: [] };
    }
  });
}

/** Human-readable value: token amounts (18 decimals), labelled addresses, market ids. */
export function formatValue(v: unknown, me?: string): string {
  if (typeof v === "bigint") {
    // Large integers in this system are 18-decimal amounts or prices.
    if (v >= 10n ** 12n || v <= -(10n ** 12n)) {
      const n = Number(formatUnits(v, 18));
      return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
    }
    return v.toString();
  }
  if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) {
    const label = labelFor(v, me);
    return label ? `${label} (${v.slice(0, 6)}…${v.slice(-4)})` : v;
  }
  if (typeof v === "string" && v === ETH_USD) return "ETH/USD";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}
