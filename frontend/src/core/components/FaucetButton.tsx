import { Droplets } from "lucide-react";
import { contracts, COLLATERAL_SYMBOL } from "../../config/contracts";
import { useTx } from "../hooks/useTx";
import { Button } from "./ui";

/** Mints 10,000 test mUSDC to the connected wallet. Test token only. */
export function FaucetButton({ variant = "secondary" }: { variant?: "secondary" | "accent" | "primary" }) {
  const { send, busy } = useTx();
  return (
    <Button
      variant={variant}
      loading={busy}
      onClick={() => send(`Get 10,000 test ${COLLATERAL_SYMBOL}`, "Core", { ...contracts.usdc, functionName: "faucet" })}
    >
      {!busy && <Droplets size={16} />} Get test {COLLATERAL_SYMBOL}
    </Button>
  );
}
