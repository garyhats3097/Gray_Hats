import { useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { ChevronDown, FlaskConical, LogOut, RefreshCw, Wallet } from "lucide-react";
import { isDemoConnector, resetDemoWallet } from "../../config/demoWallet";
import { shortAddress } from "../lib/format";
import { friendlyError } from "../lib/errors";
import { Badge, Button } from "./ui";
import { useToast } from "./Toaster";

export function hasInjectedWallet() {
  return typeof window !== "undefined" && "ethereum" in window;
}

/** Connect with MetaMask (the injected wallet) or with a demo wallet created in this browser. */
function useWalletConnect() {
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const toast = useToast();
  const wallet = connectors.find((c) => !isDemoConnector(c));
  const demo = connectors.find(isDemoConnector);
  const e2e = import.meta.env.VITE_E2E === "1";

  async function connect(which: "wallet" | "demo") {
    const connector = which === "demo" ? demo : wallet;
    if (!connector) return;
    try {
      await connectAsync({ connector });
      if (which === "demo") toast.push({ kind: "success", title: "Demo wallet ready", body: "A test account with 10,000 test mUSDC, kept in this browser." });
    } catch (e) {
      toast.push({ kind: "error", title: which === "demo" ? "Couldn't create the demo wallet" : "Wallet not connected", body: friendlyError(e) });
    }
  }

  const pendingId = isPending ? (variables?.connector as { id?: string } | undefined)?.id : undefined;
  return {
    connect,
    hasWallet: hasInjectedWallet() || e2e,
    walletPending: !!pendingId && pendingId !== "demo",
    demoPending: pendingId === "demo",
  };
}

/** The big connect block on the welcome screen: MetaMask first, demo wallet as the fallback. */
export function ConnectChoices() {
  const { connect, hasWallet, walletPending, demoPending } = useWalletConnect();
  return (
    <div className="flex flex-col items-center gap-3">
      {hasWallet ? (
        <Button size="lg" variant="accent" loading={walletPending} disabled={demoPending} onClick={() => connect("wallet")}>
          {!walletPending && <Wallet size={16} />} Connect MetaMask
        </Button>
      ) : (
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          <Button size="lg" variant="accent">
            <Wallet size={16} /> Install MetaMask
          </Button>
        </a>
      )}
      <div className="mt-1 flex flex-col items-center gap-1.5 text-[13px] text-muted">
        <span>Don't have a wallet?</span>
        <Button variant="secondary" loading={demoPending} disabled={walletPending} onClick={() => connect("demo")}>
          {!demoPending && <FlaskConical size={15} />} {demoPending ? "Creating your demo wallet…" : "Try with a demo wallet"}
        </Button>
        <span className="text-xs text-subtle">A free test account in this browser, ready in seconds. Test money only.</span>
      </div>
    </div>
  );
}

export function ConnectButton({ size = "md" }: { size?: "md" | "lg" }) {
  const { address, isConnected, connector } = useAccount();
  const { disconnect, disconnectAsync } = useDisconnect();
  const { connect, hasWallet, walletPending, demoPending } = useWalletConnect();
  const [open, setOpen] = useState(false);
  const demo = isDemoConnector(connector);

  if (!isConnected) {
    return (
      <div className="relative">
        <Button size={size} variant="accent" loading={walletPending || demoPending} onClick={() => setOpen((o) => !o)}>
          {!(walletPending || demoPending) && <Wallet size={16} />} Connect Wallet
        </Button>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-30 mt-2 w-64 origin-top-right animate-pop rounded-xl border border-line bg-surface p-1.5 text-left shadow-[var(--shadow-float)]">
              {hasWallet ? (
                <MenuItem
                  icon={<Wallet size={16} />}
                  title="MetaMask"
                  body="Use your own wallet"
                  onClick={() => {
                    setOpen(false);
                    connect("wallet");
                  }}
                />
              ) : (
                <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                  <MenuItem icon={<Wallet size={16} />} title="Install MetaMask" body="Opens metamask.io" />
                </a>
              )}
              <MenuItem
                icon={<FlaskConical size={16} />}
                title="Demo wallet"
                body="No install: a test account in this browser"
                onClick={() => {
                  setOpen(false);
                  connect("demo");
                }}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium shadow-[0_1px_2px_rgb(14_23_38/0.05)] transition-[box-shadow,border-color] duration-200 hover:border-line-strong hover:shadow-[0_6px_14px_-8px_rgb(14_23_38/0.3)]"
      >
        <span className="h-5 w-5 rounded-full bg-gradient-to-br from-accent to-lending ring-2 ring-surface shadow-[0_0_0_1px_var(--color-line)]" aria-hidden />
        {demo && <Badge tone="warning">Demo</Badge>}
        <span className="tabular">{shortAddress(address)}</span>
        <ChevronDown size={14} className={`text-subtle transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 w-64 origin-top-right animate-pop rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
            <p className="px-2.5 py-2 font-mono text-[11px] break-all text-muted">{address}</p>
            {demo && (
              <>
                <p className="px-2.5 pb-2 text-xs leading-relaxed text-subtle">
                  Demo wallet: a test account kept in this browser. Clearing site data or another browser means a new account.
                </p>
                <button
                  onClick={async () => {
                    setOpen(false);
                    await disconnectAsync();
                    resetDemoWallet();
                    connect("demo");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition-colors hover:bg-sunken"
                >
                  <RefreshCw size={15} className="shrink-0" /> Start fresh (new demo account)
                </button>
              </>
            )}
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

function MenuItem({ icon, title, body, onClick }: { icon: ReactNode; title: string; body: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-sunken">
      <span className="mt-0.5 text-accent">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-subtle">{body}</span>
      </span>
    </button>
  );
}
