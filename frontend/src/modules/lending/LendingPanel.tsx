import { useState } from "react";
import { Modal } from "../../core/components/Modal";
import { VaultForm } from "../../core/components/VaultForm";
import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { maxUint256 } from "viem";
import { contracts, COLLATERAL_SYMBOL } from "../../config/contracts";
import { useAccountState } from "../../core/hooks/useAccountState";
import { useTx } from "../../core/hooks/useTx";
import { AmountInput } from "../../core/components/AmountInput";
import { fmtHealth, healthStatus } from "../../core/components/HealthGauge";
import { Badge, Button, Callout, KeyValue, Tabs } from "../../core/components/ui";
import { fmtUsd, parseAmount } from "../../core/lib/format";
import { TIERS, healthFor, useCredit, useLendingMarket } from "./hooks";

type Action = "supply" | "borrow" | "repay" | "withdraw";

function HealthChip({ hf }: { hf: number | null }) {
  const st = healthStatus(hf);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={st.tone === "neutral" ? "neutral" : st.tone}>{st.label}</Badge>
      <span className="tabular font-semibold">{fmtHealth(hf)}</span>
    </span>
  );
}

export function LendingPanel() {
  const s = useAccountState();
  const { poolLiquidity, repayAllowance } = useLendingMarket();
  const c = useCredit();
  const { send, busy } = useTx();
  const [action, setAction] = useState<Action>("supply");
  const [input, setInput] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);

  const amount = parseAmount(input);
  const col = s.lendingCollateral;
  const debt = s.debt;

  // Maximums per action
  const removable = c.maxRemovable ?? 0n; // computed by the contract under your credit terms
  const borrowMax = poolLiquidity !== undefined && poolLiquidity < s.borrowCapacity ? poolLiquidity : s.borrowCapacity;
  const repayMax = debt < s.walletBalance ? debt : s.walletBalance;
  const max = { supply: s.free, borrow: borrowMax, repay: repayMax, withdraw: removable }[action];

  // Result after the action, for the preview
  const a = amount ?? 0n;
  const after = {
    supply: { col: col + a, debt },
    borrow: { col, debt: debt + a },
    repay: { col, debt: a >= debt ? 0n : debt - a },
    withdraw: { col: col > a ? col - a : 0n, debt },
  }[action];

  // A new borrow takes the current tier's liquidation threshold; other actions keep the loan's own.
  const previewThreshold = (action === "borrow" ? c.terms?.liquidationThresholdBps : c.loanThresholdBps) ?? 8_500n;
  const unsecuredAfter = action === "borrow" && after.debt > after.col ? after.debt - after.col : 0n;

  let error: string | null = null;
  if (input && amount === null) error = "Enter a valid amount";
  else if (amount !== null && amount > max) {
    error = {
      supply: "Exceeds your available collateral in the vault",
      borrow:
        poolLiquidity !== undefined && amount > poolLiquidity
          ? "Not enough liquidity in the pool"
          : `Over your limit: ${TIERS[c.terms?.tier ?? 0].ltvPct}% of collateral for the ${TIERS[c.terms?.tier ?? 0].name} tier. A higher credit tier lets you borrow more.`,
      repay: amount > debt ? `More than you owe (${fmtUsd(debt)})` : "Exceeds your wallet balance",
      withdraw: "That collateral is backing your loan. Repay first.",
    }[action];
  }

  // Interest accrues every second, so an amount within 0.01% of the debt counts as "repay everything".
  const isFullRepay = action === "repay" && amount !== null && debt > 0n && amount * 10_001n >= debt * 10_000n;
  // Full repayment sends "max" so accrued interest leaves no dust. We approve a 0.1% buffer
  // (about a week of interest) but only require enough for the debt plus a few minutes of
  // interest — otherwise the growing debt would ask for a new approval every time.
  const repayApproval = isFullRepay ? debt + debt / 1000n + 1n : a;
  const repayNeeded = isFullRepay ? debt + debt / 100_000n + 1n : a;
  const needsApproval = action === "repay" && amount !== null && repayAllowance < repayNeeded;

  async function submit() {
    if (amount === null) return;
    let ok = false;
    if (action === "supply") {
      ok = await send(`Allocate ${fmtUsd(amount)} to Lending`, "Lending", { ...contracts.lending, functionName: "addCollateral", args: [amount] });
    } else if (action === "borrow") {
      ok = await send(`Borrow ${fmtUsd(amount)}`, "Lending", { ...contracts.lending, functionName: "borrow", args: [amount] });
    } else if (action === "withdraw") {
      ok = await send(`Release ${fmtUsd(amount)} from Lending`, "Lending", { ...contracts.lending, functionName: "removeCollateral", args: [amount] });
    } else if (needsApproval) {
      await send(`Approve ${COLLATERAL_SYMBOL} for repayment`, "Lending", {
        ...contracts.usdc,
        functionName: "approve",
        args: [contracts.lending.address, repayApproval],
      });
      return;
    } else {
      ok = await send(isFullRepay ? "Repay full loan" : `Repay ${fmtUsd(amount)}`, "Lending", {
        ...contracts.lending,
        functionName: "repay",
        args: [s.address!, isFullRepay ? maxUint256 : amount],
      });
    }
    if (ok) setInput("");
  }

  const labels: Record<Action, string> = { supply: "Allocate", borrow: "Borrow", repay: "Repay", withdraw: "Release" };
  const inputLabel: Record<Action, string> = {
    supply: "Collateral to allocate from the vault",
    borrow: `Amount to borrow (sent to your wallet)`,
    repay: "Amount to repay (from your wallet)",
    withdraw: "Collateral to release back to the vault",
  };
  const maxLabel: Record<Action, string> = { supply: "Available in vault", borrow: "Can borrow", repay: "Repayable", withdraw: "Releasable" };

  const switchTo = (v: Action) => {
    setAction(v);
    setInput("");
  };

  // When an action can't be used yet, say why and point to the step that comes first.
  const blocked: Record<Action, { message: string; go?: Action; vault?: boolean } | null> = {
    supply:
      s.free === 0n
        ? {
            message:
              s.deposits > 0n
                ? `All ${fmtUsd(s.deposits)} in the shared vault is already in use (${fmtUsd(s.totalLocked)} locked by modules). Your wallet has ${fmtUsd(s.walletBalance)} that is not in the vault yet: deposit some, then allocate it here.`
                : `Nothing is deposited in the shared vault yet. Your wallet has ${fmtUsd(s.walletBalance)}: deposit some, then allocate it here.`,
            vault: true,
          }
        : null,
    borrow: col === 0n ? { message: `Allocate collateral to Lending first. Your ${TIERS[c.terms?.tier ?? 0].name} tier lets you borrow up to ${TIERS[c.terms?.tier ?? 0].ltvPct}% of it.`, go: "supply" } : null,
    repay: debt === 0n ? { message: "You don't have a loan to repay. Borrow first, then come back here to pay it back.", go: "borrow" } : null,
    withdraw: col === 0n ? { message: "No collateral is allocated to Lending, so there is nothing to release.", go: "supply" } : null,
  };
  const block = s.loaded ? blocked[action] : null;

  return (
    <div className="space-y-5">
      <Tabs value={action} onChange={switchTo} options={(Object.keys(labels) as Action[]).map((k) => ({ value: k, label: labels[k] }))} />
      <p className="tabular flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
        <span>
          Available in the shared vault: <b className="text-ink">{fmtUsd(s.free)}</b>
        </span>
        {s.walletBalance > 0n && !block?.vault && (
          <button onClick={() => setDepositOpen(true)} className="text-[13px] font-medium text-accent hover:underline">
            Deposit from wallet
          </button>
        )}
      </p>

      {block ? (
        <div key={action} className="animate-fade space-y-4">
          <Callout icon={<Info size={14} />}>{block.message}</Callout>
          {block.go && (
            <Button className="w-full" variant="secondary" onClick={() => switchTo(block.go!)}>
              Go to {labels[block.go]}
            </Button>
          )}
          {block.vault &&
            (s.walletBalance > 0n ? (
              <Button className="w-full" onClick={() => setDepositOpen(true)}>
                Deposit from wallet
              </Button>
            ) : (
              <Link to="/vault" className="block">
                <Button className="w-full" variant="secondary">
                  Go to Shared Vault (get test mUSDC)
                </Button>
              </Link>
            ))}
        </div>
      ) : (
        <div key={action} className="animate-fade space-y-5">
          <AmountInput label={inputLabel[action]} value={input} onChange={setInput} max={max} maxLabel={maxLabel[action]} symbol={COLLATERAL_SYMBOL} error={error} disabled={busy} />
          {action === "borrow" && c.terms && (
            <p className="-mt-2 text-xs text-muted">
              Your limit: <b className="text-ink">{TIERS[c.terms.tier].ltvPct}% of collateral</b> ({TIERS[c.terms.tier].name} tier, score {String(c.terms.score)}).
              {c.terms.tier < 3 && ` Up to 120% unlocks at Prime (85 points) — see Credit profile.`}
            </p>
          )}

          <div className="divide-y divide-line rounded-xl bg-sunken/60 px-3.5">
            <div className="py-2.5 text-[13px]">
              <p className="mb-1.5 text-muted">Health factor</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <HealthChip hf={s.healthFactor} />
                {amount !== null && !error && (
                  <>
                    <ArrowRight size={13} className="text-subtle" />
                    <HealthChip hf={healthFor(after.col, after.debt, previewThreshold)} />
                  </>
                )}
              </div>
            </div>
            <KeyValue label="Collateral in Lending" value={amount !== null && !error && after.col !== col ? `${fmtUsd(col)} → ${fmtUsd(after.col)}` : fmtUsd(col)} />
            <KeyValue label="Debt" value={amount !== null && !error && after.debt !== debt ? `${fmtUsd(debt)} → ${fmtUsd(after.debt)}` : fmtUsd(debt)} />
            {action === "borrow" && <KeyValue label="Borrow APR" value="5.00% (simple)" />}
          </div>

          {action === "borrow" && unsecuredAfter > 0n && amount !== null && !error && (
            <Callout tone="warning" icon={<AlertTriangle size={14} className="text-warning" />}>
              <b>Undercollateralized loan:</b> your debt would be {fmtUsd(unsecuredAfter)} more than your collateral. This is allowed by your{" "}
              {TIERS[c.terms?.tier ?? 0].name} credit tier. If the loan is liquidated you lose all of this collateral and your credit is marked as
              defaulted for good.
            </Callout>
          )}
          {action === "borrow" && (
            <Callout>Borrowed {COLLATERAL_SYMBOL} comes from the lending pool seeded by the deploy script (test funds) — there are no real lenders in this prototype.</Callout>
          )}
          {needsApproval && (
            <Callout tone="accent">
              <b>Step 1 of 2:</b> approve the Lending module to take {fmtUsd(repayApproval)} {COLLATERAL_SYMBOL} from your wallet{isFullRepay && " (includes a small buffer for interest)"}. Then confirm the repayment.
            </Callout>
          )}

          <Button className="w-full" size="lg" disabled={amount === null || !!error || busy} loading={busy} onClick={submit}>
            {amount === null ? "Enter an amount" : needsApproval ? `Approve ${COLLATERAL_SYMBOL}` : isFullRepay ? "Repay full loan" : labels[action]}
          </Button>
        </div>
      )}
      <Modal open={depositOpen} onClose={() => setDepositOpen(false)} title="Deposit into the shared vault">
        <p className="mb-4 text-[13px] text-muted">Move mUSDC from your wallet into the shared vault. Then allocate it to Lending.</p>
        <VaultForm onDone={() => setDepositOpen(false)} />
      </Modal>
    </div>
  );
}
