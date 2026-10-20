import { createTestClient, createWalletClient, http, publicActions } from "viem";
import { anvilLocal } from "../../config/chain";
import { ADMIN_ADDRESS } from "../../config/contracts";

/**
 * DEMO ONLY — works exclusively against a local Anvil node.
 * Anvil signs transactions for its built-in test accounts itself, so the admin
 * account (#0) can set the mock price without any private key in the frontend.
 * On any real network these calls simply fail.
 */
export const adminWallet = createWalletClient({ chain: anvilLocal, transport: http(), account: ADMIN_ADDRESS });

/** Anvil "cheat" RPC: move the chain clock forward (used to show interest accruing). */
export const anvilTestClient = createTestClient({ chain: anvilLocal, mode: "anvil", transport: http() }).extend(publicActions);
