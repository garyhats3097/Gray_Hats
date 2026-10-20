import { defineChain } from "viem";

/** The local Anvil chain. Contract addresses in deployments.json belong to this chain. */
export const anvilLocal = defineChain({
  id: 31337,
  name: "Anvil (local)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_RPC_URL ?? "http://127.0.0.1:8545"] } },
  testnet: true,
});
