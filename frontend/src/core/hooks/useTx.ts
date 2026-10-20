import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Abi, Address } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/Toaster";
import { friendlyError } from "../lib/errors";
import { recordFailure } from "../lib/sessionLog";

/** A contract call: spread `contracts.x` and add functionName/args. */
type WriteRequest = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };

/**
 * Sends one contract transaction with the full lifecycle:
 *   simulate (catches reverts before the wallet opens) → wallet signature →
 *   pending → wait for receipt → refresh all on-chain reads → toast.
 * Returns true only if the transaction was confirmed successfully.
 */
export function useTx() {
  const { address } = useAccount();
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const toast = useToast();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  async function send(label: string, module: string, request: WriteRequest): Promise<boolean> {
    if (!client || !address) return false;
    setPendingLabel(label);
    const id = toast.push({ kind: "pending", title: label, body: "Confirm in your wallet…" });
    try {
      // Simulating first gives a readable error instead of a failed wallet popup.
      await client.simulateContract({ ...request, account: address });
      const hash = await writeContractAsync(request as never);
      toast.update(id, { body: "Waiting for confirmation…", hash });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted on-chain.");
      toast.update(id, { kind: "success", body: "Confirmed on-chain.", hash });
      await queryClient.invalidateQueries();
      return true;
    } catch (error) {
      const message = friendlyError(error);
      toast.update(id, { kind: "error", body: message });
      recordFailure({ label, module, message, account: address });
      return false;
    } finally {
      setPendingLabel(null);
    }
  }

  return { send, pendingLabel, busy: pendingLabel !== null };
}
