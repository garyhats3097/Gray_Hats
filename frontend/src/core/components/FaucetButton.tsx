import { useState } from "react";
import { useAccount } from "wagmi";
import { Droplets } from "lucide-react";
import { contracts, COLLATERAL_SYMBOL } from "../../config/contracts";
import { topUpGas } from "../../config/demoWallet";
import { useTx } from "../hooks/useTx";
import { friendlyError } from "../lib/errors";
import { useToast } from "./Toaster";
import { Button } from "./ui";

/**
 * Mints 10,000 test mUSDC to the connected wallet. Test token only.
 * A new account has no ETH for the transaction fee, so it gets some test ETH first.
 */
export function FaucetButton({ variant = "secondary" }: { variant?: "secondary" | "accent" | "primary" }) {
  const { address } = useAccount();
  const { send, busy } = useTx();
  const toast = useToast();
  const [fueling, setFueling] = useState(false);
  return (
    <Button
      variant={variant}
      loading={busy || fueling}
      onClick={async () => {
        if (address) {
          setFueling(true);
          try {
            await topUpGas(address);
          } catch (e) {
            toast.push({ kind: "error", title: "Couldn't get test ETH for fees", body: friendlyError(e) });
            return;
          } finally {
            setFueling(false);
          }
        }
        send(`Get 10,000 test ${COLLATERAL_SYMBOL}`, "Core", { ...contracts.usdc, functionName: "faucet" });
      }}
    >
      {!(busy || fueling) && <Droplets size={16} />} Get test {COLLATERAL_SYMBOL}
    </Button>
  );
}
