import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { shortAddress } from "../lib/format";
import { friendlyError } from "../lib/errors";
import { Button } from "./ui";
import { useToast } from "./Toaster";

export function hasInjectedWallet() {
  return typeof window !== "undefined" && "ethereum" in window;
}

export function ConnectButton({ size = "md" }: { size?: "md" | "lg" }) {
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const e2e = import.meta.env.VITE_E2E === "1";

  if (!isConnected) {
    if (!hasInjectedWallet() && !e2e) {
      return (
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          <Button size={size} variant="accent">
            <Wallet size={16} /> Install MetaMask
          </Button>
        </a>
      );
    }
    return (
      <Button
        size={size}
        variant="accent"
        loading={isPending}
        onClick={async () => {
          try {
            await connectAsync({ connector: connectors[0] });
          } catch (e) {
            toast.push({ kind: "error", title: "Wallet not connected", body: friendlyError(e) });
          }
        }}
      >
        {!isPending && <Wallet size={16} />} Connect Wallet
      </Button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium shadow-[0_1px_2px_rgb(64_46_24/0.05)] transition-[box-shadow,border-color] duration-200 hover:border-line-strong hover:shadow-[0_6px_14px_-8px_rgb(64_46_24/0.3)]"
      >
        <span className="h-5 w-5 rounded-full bg-gradient-to-br from-accent to-lending ring-2 ring-surface shadow-[0_0_0_1px_var(--color-line)]" aria-hidden />
        <span className="tabular">{shortAddress(address)}</span>
        <ChevronDown size={14} className={`text-subtle transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-56 origin-top-right animate-pop rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
            <p className="px-2.5 py-2 font-mono text-[11px] break-all text-muted">{address}</p>
            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink transition-colors hover:bg-negative-soft hover:text-negative"
            >
              <LogOut size={15} /> Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
