import { useAccount, useSwitchChain } from "wagmi";
import { AlertTriangle } from "lucide-react";
import { anvilLocal } from "../../config/chain";
import { friendlyError } from "../lib/errors";
import { useToast } from "./Toaster";
import { Button } from "./ui";

export function useWrongNetwork() {
  const { isConnected, chainId } = useAccount();
  return isConnected && chainId !== anvilLocal.id;
}

export function NetworkBadge() {
  const wrong = useWrongNetwork();
  return (
    <span className="hidden h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-muted sm:inline-flex">
      <span className={`h-2 w-2 rounded-full ${wrong ? "bg-negative" : "bg-positive"}`} />
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
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-negative/30 bg-negative-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
