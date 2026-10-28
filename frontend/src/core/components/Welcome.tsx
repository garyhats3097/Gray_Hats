import { CandlestickChart, HandCoins, Repeat2, ShieldCheck, Vault } from "lucide-react";
import { Link } from "react-router-dom";
import { ConnectChoices } from "./ConnectButton";

const POINTS = [
  { icon: Vault, title: "One shared vault", body: "Deposit collateral once. Every module draws on the same ledger." },
  { icon: CandlestickChart, title: "Perpetuals", body: "Open leveraged long or short positions on ETH/USD." },
  { icon: HandCoins, title: "Lending", body: "Borrow against collateral you allocate to lending." },
  { icon: ShieldCheck, title: "No double-counting", body: "Collateral locked by one module can't be used by another." },
];

const FLOW = [
  { label: "Perpetuals", icon: CandlestickChart, color: "var(--color-perps)", x: 50 },
  { label: "Lending", icon: HandCoins, color: "var(--color-lending)", x: 150 },
  { label: "Market Maker", icon: Repeat2, color: "var(--color-marketmaker)", x: 250 },
];

/** One vault feeding every module — the core idea, drawn as a live ledger. */
export function FlowDiagram() {
  return (
    <div className="anim-rise mx-auto mt-12 w-full max-w-xl" aria-hidden>
      <div className="flex justify-center">
        <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-surface px-4 py-2.5 shadow-[var(--shadow-raised)]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-white">
            <Vault size={15} />
          </span>
          <span className="text-left leading-tight">
            <span className="block text-[13px] font-semibold">Shared Vault</span>
            <span className="block font-mono text-[10px] tracking-wider text-subtle uppercase">One ledger · mUSDC</span>
          </span>
        </div>
      </div>
      <svg viewBox="0 0 300 56" preserveAspectRatio="none" className="h-14 w-full">
        {FLOW.map((f) => {
          const d = `M150 0 C150 30, ${f.x} 26, ${f.x} 56`;
          return (
            <g key={f.label}>
              <path d={d} fill="none" stroke="var(--color-line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <path
                d={d}
                fill="none"
                stroke={f.color}
                strokeWidth={1.5}
                strokeDasharray="3 13"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ animation: "dash 1.2s linear infinite" }}
              />
            </g>
          );
        })}
      </svg>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {FLOW.map(({ label, icon: Icon, color }) => (
          <div key={label} className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface/80 px-2 py-2 text-[12px] font-medium text-ink sm:text-[13px]">
            <Icon size={14} style={{ color }} className="hidden shrink-0 sm:block" />
            <span className="truncate">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Welcome() {
  return (
    <div className="relative mx-auto max-w-3xl py-8 text-center sm:py-14">
      {/* Ruled ledger lines, fading out from the centre */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-10%] top-0 -z-10 h-[420px]"
        style={{
          backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 31px, var(--color-line) 31px 32px)",
          maskImage: "radial-gradient(ellipse 60% 70% at 50% 35%, black 10%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 50% 35%, black 10%, transparent 75%)",
        }}
      />

      <p className="anim-rise mb-5 inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1 font-mono text-[11px] tracking-[0.14em] text-muted uppercase shadow-[0_1px_2px_rgb(14_23_38/0.05)]">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        One Core. Multiple Financial Products.
      </p>
      <h1 className="display anim-rise text-[44px] leading-[1.02] font-medium sm:text-[64px]">
        Welcome to <em className="font-normal text-accent">Modular</em> DeFi
      </h1>
      <p className="anim-rise mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
        Connect your wallet to manage collateral, explore perpetual trading, and access lending through one shared financial core.
      </p>
      <div className="anim-rise mt-8 flex flex-col items-center gap-3">
        <ConnectChoices />
        <Link to="/help" className="text-[13px] text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">
          First time? Set up MetaMask for the local network
        </Link>
      </div>

      <FlowDiagram />

      <div className="mt-14 grid gap-3 text-left sm:grid-cols-2">
        {POINTS.map(({ icon: Icon, title, body }, i) => (
          <div key={title} className="card card-lift anim-rise group rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-start justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent transition-[background-color,color] duration-300 group-hover:bg-accent group-hover:text-white">
                <Icon size={18} />
              </span>
              <span className="font-mono text-[11px] text-subtle">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <p className="mt-4 text-sm font-semibold">{title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-xs text-subtle">
        Prototype using test tokens on a local blockchain. We only read your public wallet address — never your seed phrase or private key.
      </p>
    </div>
  );
}
