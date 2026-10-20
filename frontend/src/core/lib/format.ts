import { formatUnits, parseUnits } from "viem";

export const TOKEN_DECIMALS = 18;

/** bigint (18 decimals) → JS number. Fine for display; never use for on-chain math. */
export function toNumber(value: bigint | undefined): number {
  if (value === undefined) return 0;
  return Number(formatUnits(value, TOKEN_DECIMALS));
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtUsd(value: bigint | number | undefined): string {
  const n = typeof value === "number" ? value : toNumber(value);
  return usd.format(n);
}

export function fmtAmount(value: bigint | number | undefined): string {
  const n = typeof value === "number" ? value : toNumber(value);
  return plain.format(n);
}

/** "+$12.30" / "−$4.00" for profit and loss. */
export function fmtSignedUsd(value: bigint | number | undefined): string {
  const n = typeof value === "number" ? value : toNumber(value);
  if (n === 0) return usd.format(0);
  return `${n > 0 ? "+" : "−"}${usd.format(Math.abs(n))}`;
}

export function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function shortAddress(address?: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Parse a user-typed amount. Returns null if it is not a valid positive number. */
export function parseAmount(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") return null;
  try {
    const value = parseUnits(trimmed, TOKEN_DECIMALS);
    return value > 0n ? value : null;
  } catch {
    return null;
  }
}

export function fmtTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
