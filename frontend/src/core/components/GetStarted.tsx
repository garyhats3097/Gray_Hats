import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Droplets, Vault, Blocks } from "lucide-react";
import { COLLATERAL_SYMBOL } from "../../config/contracts";
import { fmtUsd } from "../lib/format";
import { FaucetButton } from "./FaucetButton";
import { FlowDiagram } from "./Welcome";
import { Button, cx } from "./ui";

type StepState = "done" | "current" | "upcoming";

function Step({ n, state, icon, title, body }: { n: number; state: StepState; icon: ReactNode; title: string; body: ReactNode }) {
  return (
    <div
      className={cx(
        "card card-lift anim-rise relative rounded-2xl border bg-surface p-5 text-left shadow-[var(--shadow-card)]",
        state === "current" && "!border-accent/50 ring-4 ring-accent/10",
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cx(
            "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
            state === "done" ? "bg-positive-soft text-positive" : state === "current" ? "bg-accent text-white" : "bg-sunken text-muted",
          )}
        >
          {state === "done" ? <Check size={18} strokeWidth={2.5} /> : icon}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-subtle">
          {state === "current" && (
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-live rounded-full bg-accent" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
          )}
          {state === "done" ? "DONE" : state === "current" ? "NEXT" : String(n).padStart(2, "0")}
        </span>
      </div>
      <p className={cx("mt-4 text-sm font-semibold", state === "done" && "text-muted line-through decoration-line-strong")}>{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

/** Onboarding shown on the Portfolio page until the user has deposited anything. */
export function GetStarted({ walletBalance, onDeposit }: { walletBalance: bigint; onDeposit: () => void }) {
  const hasTokens = walletBalance > 0n;
  return (
    <section className="card anim-rise relative overflow-hidden rounded-[var(--radius-card)] border bg-surface px-5 py-10 text-center shadow-[var(--shadow-card)] sm:px-10 sm:py-14">
      {/* Ruled ledger lines, fading out from the centre (same backdrop as the Welcome screen) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px]"
        style={{
          backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 31px, var(--color-line) 31px 32px)",
          maskImage: "radial-gradient(ellipse 55% 70% at 50% 30%, black 10%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 55% 70% at 50% 30%, black 10%, transparent 75%)",
        }}
      />

      <div className="relative">
        <p className="anim-rise mb-5 inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1 font-mono text-[11px] tracking-[0.14em] text-muted uppercase shadow-[0_1px_2px_rgb(14_23_38/0.05)]">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Getting started · 3 steps
        </p>
        <h2 className="display anim-rise text-[34px] leading-[1.05] font-medium sm:text-[48px]">
          Fund your <em className="font-normal text-accent">shared vault</em>
        </h2>
        <p className="anim-rise mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
          {hasTokens ? (
            <>
              You have <b className="text-ink">{fmtUsd(walletBalance)}</b> test {COLLATERAL_SYMBOL} in your wallet. Deposit it once and every module can use it.
            </>
          ) : (
            <>Get some test {COLLATERAL_SYMBOL} from the faucet, then deposit it into the shared vault to start trading or borrowing.</>
          )}
        </p>
        <div className="anim-rise mt-7 flex flex-wrap justify-center gap-2">
          {!hasTokens && <FaucetButton variant="secondary" />}
          <Button size="lg" onClick={onDeposit} disabled={!hasTokens}>
            <Vault size={17} /> Deposit Test Collateral
          </Button>
        </div>

        <FlowDiagram />

        <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-3">
          <Step
            n={1}
            state={hasTokens ? "done" : "current"}
            icon={<Droplets size={18} />}
            title={`Get test ${COLLATERAL_SYMBOL}`}
            body={hasTokens ? `${fmtUsd(walletBalance)} is in your wallet.` : "The faucet sends 10,000 free test tokens to your wallet."}
          />
          <Step
            n={2}
            state={hasTokens ? "current" : "upcoming"}
            icon={<Vault size={18} />}
            title="Deposit into the vault"
            body="One deposit becomes collateral for every module. Withdraw whatever isn't locked, anytime."
          />
          <Step
            n={3}
            state="upcoming"
            icon={<Blocks size={18} />}
            title="Trade, borrow or quote"
            body={
              <>
                Open a position in{" "}
                <Link to="/perps" className="font-medium text-accent hover:underline">
                  Perpetuals
                </Link>{" "}
                or borrow in{" "}
                <Link to="/lending" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
                  Lending <ArrowRight size={12} />
                </Link>
              </>
            }
          />
        </div>
      </div>
    </section>
  );
}
