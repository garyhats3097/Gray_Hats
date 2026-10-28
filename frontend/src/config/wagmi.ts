import { createConfig, http } from "wagmi";
import { injected, mock } from "wagmi/connectors";
import { anvilLocal } from "./chain";
import { demoWallet } from "./demoWallet";

// VITE_E2E=1 adds a "test wallet" connector that uses Anvil's unlocked account #1.
// It exists only for automated browser tests — normal use goes through MetaMask.
const e2e = import.meta.env.VITE_E2E === "1";

export const wagmiConfig = createConfig({
  chains: [anvilLocal],
  // The demo wallet is always second: MetaMask stays the main way in.
  connectors: e2e
    ? [mock({ accounts: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"] }), demoWallet()]
    : [injected({ target: "metaMask" }), demoWallet()],
  transports: { [anvilLocal.id]: http() },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
