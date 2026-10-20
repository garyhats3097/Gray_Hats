import { CandlestickChart, HandCoins, ShieldCheck, Vault } from "lucide-react";
import { Link } from "react-router-dom";
import { ConnectButton } from "./ConnectButton";

const POINTS = [
  { icon: Vault, title: "One shared vault", body: "Deposit collateral once. Every module draws on the same ledger." },
  { icon: CandlestickChart, title: "Perpetuals", body: "Open leveraged long or short positions on ETH/USD." },
  { icon: HandCoins, title: "Lending", body: "Borrow against collateral you allocate to lending." },
  { icon: ShieldCheck, title: "No double-counting", body: "Collateral locked by one module can't be used by another." },
];

export function Welcome() {
  return (
    <div className="mx-auto max-w-3xl py-8 text-center sm:py-16">
      <p className="mb-4 inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">One Core. Multiple Financial Products.</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Welcome to Modular DeFi</h1>
      <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
        Connect your wallet to manage collateral, explore perpetual trading, and access lending through one shared financial core.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <ConnectButton size="lg" />
        <Link to="/help" className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
          First time? Set up MetaMask for the local network
        </Link>
      </div>
      <div className="mt-14 grid gap-3 text-left sm:grid-cols-2">
        {POINTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-line bg-surface p-5">
            <Icon size={20} className="text-accent" />
            <p className="mt-3 text-sm font-semibold">{title}</p>
            <p className="mt-1 text-[13px] text-muted">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-xs text-subtle">
        Prototype using test tokens on a local blockchain. We only read your public wallet address — never your seed phrase or private key.
      </p>
    </div>
  );
}
