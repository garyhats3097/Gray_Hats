import { useState } from "react";
import { Lock } from "lucide-react";
import { contracts, COLLATERAL_SYMBOL } from "../../config/contracts";
import { useAccountState } from "../hooks/useAccountState";
import { useTx } from "../hooks/useTx";
import { fmtUsd, parseAmount } from "../lib/format";
import { AmountInput } from "./AmountInput";
import { Button, Callout, KeyValue, Tabs } from "./ui";

export type VaultAction = "deposit" | "withdraw";

/** Deposit / withdraw form. Used on the Vault page and in the Portfolio modal. */
export function VaultForm({ initial = "deposit", onDone }: { initial?: VaultAction; onDone?: () => void }) {
  const [action, setAction] = useState<VaultAction>(initial);
  const [input, setInput] = useState("");
  const s = useAccountState();
  const { send, busy } = useTx();

  const amount = parseAmount(input);
  const max = action === "deposit" ? s.walletBalance : s.free;

  let error: string | null = null;
  if (input && amount === null) error = "Enter a valid amount";
  else if (amount !== null && amount > max)
    error = action === "deposit" ? "Exceeds your wallet balance" : "Exceeds your available (unlocked) collateral";

  const needsApproval = action === "deposit" && amount !== null && s.vaultAllowance < amount;
  const canSubmit = amount !== null && !error && !busy;

  async function submit() {
    if (amount === null) return;
    if (action === "deposit") {
      if (needsApproval) {
        // Step 1: allow the vault to pull exactly this amount (not unlimited).
        await send(`Approve ${COLLATERAL_SYMBOL}`, "Core", {
          ...contracts.usdc,
          functionName: "approve",
          args: [contracts.vault.address, amount],
        });
        return; // allowance refreshes; the button becomes "Deposit"
      }
      const ok = await send(`Deposit ${fmtUsd(amount)}`, "Core", { ...contracts.vault, functionName: "deposit", args: [amount] });
      if (ok) {
        setInput("");
        onDone?.();
      }
    } else {
      const ok = await send(`Withdraw ${fmtUsd(amount)}`, "Core", { ...contracts.vault, functionName: "withdraw", args: [amount] });
      if (ok) {
        setInput("");
        onDone?.();
      }
    }
  }

  return (
    <div className="space-y-5">
      <Tabs
        value={action}
        onChange={(v) => {
          setAction(v);
          setInput("");
        }}
        options={[
          { value: "deposit", label: "Deposit" },
          { value: "withdraw", label: "Withdraw" },
        ]}
      />

      <AmountInput
        label="Amount"
        value={input}
        onChange={setInput}
        max={max}
        maxLabel={action === "deposit" ? "Wallet" : "Withdrawable"}
        symbol={COLLATERAL_SYMBOL}
        error={error}
        disabled={busy}
      />

      <div className="divide-y divide-line rounded-xl bg-sunken/60 px-3.5">
        {action === "deposit" ? (
          <>
            <KeyValue label="Deposited now" value={fmtUsd(s.deposits)} />
            <KeyValue label="Deposited after" value={fmtUsd(s.deposits + (amount && !error ? amount : 0n))} />
          </>
        ) : (
          <>
            <KeyValue label="Withdrawable now" value={fmtUsd(s.free)} />
            <KeyValue label="Locked by modules" value={fmtUsd(s.totalLocked)} info="Collateral committed to open positions or loans. Close positions or repay loans to release it." />
          </>
        )}
      </div>

      {action === "withdraw" && s.totalLocked > 0n && (
        <Callout icon={<Lock size={14} />}>
          {fmtUsd(s.totalLocked)} is locked and can't be withdrawn yet.
          {s.lockedPerps > 0n && <> Close Perpetuals positions to release {fmtUsd(s.lockedPerps)}.</>}
          {s.lockedLending > 0n && <> Repay and remove Lending collateral to release {fmtUsd(s.lockedLending)}.</>}
        </Callout>
      )}

      {needsApproval && (
        <Callout tone="accent">
          <b>Step 1 of 2:</b> approve the vault to move {fmtUsd(amount!)} {COLLATERAL_SYMBOL} from your wallet. Then confirm the deposit.
        </Callout>
      )}

      <Button className="w-full" size="lg" disabled={!canSubmit} loading={busy} onClick={submit}>
        {amount === null
          ? "Enter an amount"
          : needsApproval
            ? `Approve ${COLLATERAL_SYMBOL}`
            : action === "deposit"
              ? "Deposit"
              : "Withdraw"}
      </Button>
    </div>
  );
}
