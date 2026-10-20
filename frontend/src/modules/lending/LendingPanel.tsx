import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { maxUint256 } from "viem";
import { contracts, COLLATERAL_SYMBOL } from "../../config/contracts";
import { useAccountState } from "../../core/hooks/useAccountState";
import { useTx } from "../../core/hooks/useTx";
import { AmountInput } from "../../core/components/AmountInput";
import { fmtHealth, healthStatus } from "../../core/components/HealthGauge";
import { Badge, Button, Callout, KeyValue, Tabs } from "../../core/components/ui";
import { fmtUsd, parseAmount } from "../../core/lib/format";
import { healthFor, requiredCollateral, useLendingMarket } from "./hooks";

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
  const { send, busy } = useTx();
  const [action, setAction] = useState<Action>("supply");
  const [input, setInput] = useState("");

  const amount = parseAmount(input);
  const col = s.lendingCollateral;
  const debt = s.debt;

  // Maximums per action
  const removable = col > requiredCollateral(debt) ? col - requiredCollateral(debt) : 0n;
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

  let error: string | null = null;
  if (input && amount === null) error = "Enter a valid amount";
  else if (amount !== null && amount > max) {
    error = {
      supply: "Exceeds your available collateral in the vault",
      borrow: poolLiquidity !== undefined && amount > poolLiquidity ? "Not enough liquidity in the pool" : "Exceeds your borrowing capacity (75% of collateral)",
      repay: amount > debt ? "More than you owe" : "Exceeds your wallet balance",
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

  return (
    <div className="space-y-5">
      <Tabs
        value={action}
        onChange={(v) => {
          setAction(v);
          setInput("");
        }}
        options={(Object.keys(labels) as Action[]).map((k) => ({ value: k, label: labels[k] }))}
      />

      <AmountInput label={inputLabel[action]} value={input} onChange={setInput} max={max} maxLabel={maxLabel[action]} symbol={COLLATERAL_SYMBOL} error={error} disabled={busy} />

      <div className="divide-y divide-line rounded-xl bg-sunken/60 px-3.5">
        <div className="py-2.5 text-[13px]">
          <p className="mb-1.5 text-muted">Health factor</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <HealthChip hf={s.healthFactor} />
            {amount !== null && !error && (
              <>
                <ArrowRight size={13} className="text-subtle" />
                <HealthChip hf={healthFor(after.col, after.debt)} />
              </>
            )}
          </div>
        </div>
        <KeyValue label="Collateral in Lending" value={amount !== null && !error && after.col !== col ? `${fmtUsd(col)} → ${fmtUsd(after.col)}` : fmtUsd(col)} />
        <KeyValue label="Debt" value={amount !== null && !error && after.debt !== debt ? `${fmtUsd(debt)} → ${fmtUsd(after.debt)}` : fmtUsd(debt)} />
        {action === "borrow" && <KeyValue label="Borrow APR" value="5.00% (simple)" />}
      </div>

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
  );
}
