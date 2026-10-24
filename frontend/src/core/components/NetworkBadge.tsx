import { useState } from "react";
import { useAccount, useBytecode, useSwitchChain } from "wagmi";
import { AlertTriangle } from "lucide-react";
import { anvilLocal } from "../../config/chain";
import { contracts } from "../../config/contracts";
import { friendlyError } from "../lib/errors";
import { useToast } from "./Toaster";
import { Button, LiveDot } from "./ui";

export function useWrongNetwork() {
  const { isConnected, chainId } = useAccount();
  return isConnected && chainId !== anvilLocal.id;
}

export function NetworkBadge() {
  const wrong = useWrongNetwork();
  return (
    <span className="hidden h-10 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-muted shadow-[0_1px_2px_rgb(14_23_38/0.05)] sm:inline-flex">
      <LiveDot tone={wrong ? "negative" : "positive"} />
      {wrong ? "Wrong network" : anvilLocal.name}
    </span>
  );
}

/** Full-width banner shown when the wallet is on a chain we have no contracts for. */
export function WrongNetworkBanner() {
  const wrong = useWrongNetwork();
  const { switchChainAsync, isPending } = useSwitchChain();
  const toast = useToast();
  if (!wrong) return null;
  return (
    <div className="mb-6 flex animate-rise flex-col gap-3 rounded-xl border border-negative/30 bg-negative-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-ink">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-negative" />
        <span>
          Your wallet is on an unsupported network. Switch to <b>{anvilLocal.name}</b> (chain {anvilLocal.id}) to continue.
        </span>
      </p>
      <Button
        size="sm"
        loading={isPending}
        onClick={() =>
          switchChainAsync({ chainId: anvilLocal.id }).catch((e) =>
            toast.push({ kind: "error", title: "Could not switch network", body: friendlyError(e) }),
          )
        }
      >
        Switch network
      </Button>
    </div>
  );
}

/**
 * Warns when the site can't reach the chain, or reaches a chain without our contracts
 * (e.g. a plain `anvil` that was never deployed to). Otherwise every page would just look empty.
 */
export function ChainStatusBanner() {
  const { data: code, isError, isSuccess } = useBytecode({ address: contracts.vault.address, chainId: anvilLocal.id });
  const rpc = anvilLocal.rpcUrls.default.http[0];

  if (isError) {
    return (
      <div className="mb-6 flex animate-rise items-start gap-2 rounded-xl border border-negative/30 bg-negative-soft px-4 py-3 text-sm text-ink">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-negative" />
        <span>
          <b>Can't reach the blockchain at {rpc}.</b> Start it in a WSL terminal with{" "}
          <code className="rounded bg-surface px-1">./scripts/start-chain.sh</code>, then reload this page.
        </span>
      </div>
    );
  }
  if (isSuccess && (!code || code === "0x")) {
    return (
      <div className="mb-6 flex animate-rise items-start gap-2 rounded-xl border border-negative/30 bg-negative-soft px-4 py-3 text-sm text-ink">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-negative" />
        <span>
          <b>This chain doesn't have the Modular DeFi contracts</b>, so nothing will show or save. It was probably started with plain{" "}
          <code className="rounded bg-surface px-1">anvil</code>. Stop it (Ctrl+C) and run{" "}
          <code className="rounded bg-surface px-1">./scripts/start-chain.sh</code> instead.
        </span>
      </div>
    );
  }
  return null;
}

/** Adds (or switches to) our chain in MetaMask in one click, instead of typing the network in by hand. */
export function AddNetworkButton() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const eth = (window as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!eth) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${anvilLocal.id.toString(16)}`,
                chainName: anvilLocal.name,
                nativeCurrency: anvilLocal.nativeCurrency,
                rpcUrls: anvilLocal.rpcUrls.default.http,
              },
            ],
          });
          toast.push({ kind: "success", title: "Network added", body: `MetaMask is set up for ${anvilLocal.name}.` });
        } catch (e) {
          toast.push({ kind: "error", title: "Network not added", body: friendlyError(e) });
        } finally {
          setBusy(false);
        }
      }}
    >
      Add {anvilLocal.name} to MetaMask
    </Button>
  );
}
