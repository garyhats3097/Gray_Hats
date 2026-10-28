import { createConnector } from "wagmi";
import { createPublicClient, createWalletClient, http, numberToHex, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { anvilLocal } from "./chain";
import { contracts } from "./contracts";

/**
 * "Demo wallet": a throwaway test account created in this browser, for visitors without MetaMask.
 * Its key is random, kept only in this browser's localStorage, and only ever used on our test chain.
 * Transactions are signed here without pop-ups. Never use this pattern with real funds.
 */

const KEY_STORAGE = "modular-defi.demo-key";
const CONNECTED_STORAGE = "modular-defi.demo-connected";

/** Anvil's public test account #9 tops up demo wallets on a local chain (no faucet server needed). */
const LOCAL_SPONSOR_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
const GAS_TOP_UP = parseEther("1");
const MIN_GAS = parseEther("0.05");

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked (private window): the demo wallet just won't survive a reload
  }
}

let memoryKey: Hex | null = null;

function demoKey(create: boolean): Hex | null {
  const stored = (read(KEY_STORAGE) as Hex | null) ?? memoryKey;
  if (stored || !create) return stored;
  memoryKey = generatePrivateKey();
  write(KEY_STORAGE, memoryKey);
  return memoryKey;
}

/** Forget the current demo account so the next connect creates a new, empty one. */
export function resetDemoWallet() {
  memoryKey = null;
  write(KEY_STORAGE, null);
  write(CONNECTED_STORAGE, null);
}

const publicClient = createPublicClient({ chain: anvilLocal, transport: http() });

function isLocalChain() {
  const url = anvilLocal.rpcUrls.default.http[0];
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host);
  } catch {
    return false;
  }
}

/**
 * Make sure an address has test ETH for transaction fees (any wallet, not only demo ones).
 * Hosted: asks the site's faucet endpoint. Local chain: Anvil's public account #9 sends it.
 */
export async function topUpGas(address: Address) {
  if ((await publicClient.getBalance({ address })) >= MIN_GAS) return;
  const fromServer = await fetch("/api/faucet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  })
    .then((r) => r.ok)
    .catch(() => false);
  if (fromServer) return;
  if (!isLocalChain()) throw new Error("The test-ETH faucet is unavailable right now. Try again in a minute.");
  const sponsor = createWalletClient({ account: privateKeyToAccount(LOCAL_SPONSOR_KEY), chain: anvilLocal, transport: http() });
  const hash = await sponsor.sendTransaction({ to: address, value: GAS_TOP_UP });
  await publicClient.waitForTransactionReceipt({ hash });
}

/** Give a new demo account test ETH for fees and 10,000 test mUSDC. */
export async function fundDemoWallet(key: Hex) {
  const account = privateKeyToAccount(key);
  await topUpGas(account.address);
  const usdc = await publicClient.readContract({ ...contracts.usdc, functionName: "balanceOf", args: [account.address] });
  if (usdc === 0n) {
    const wallet = createWalletClient({ account, chain: anvilLocal, transport: http() });
    const hash = await wallet.writeContract({ ...contracts.usdc, functionName: "faucet" });
    await publicClient.waitForTransactionReceipt({ hash });
  }
}

type Req = { method: string; params?: unknown[] | Record<string, unknown> };
type RpcTx = { to?: Hex; data?: Hex; value?: Hex; gas?: Hex };

/** An EIP-1193 provider that signs with the demo key and sends everything else to the chain. */
function demoProvider(key: Hex) {
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: anvilLocal, transport: http() });
  return {
    async request({ method, params }: Req): Promise<unknown> {
      const p = (params ?? []) as unknown[];
      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return [account.address];
        case "eth_chainId":
          return numberToHex(anvilLocal.id);
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        case "eth_sendTransaction": {
          const tx = p[0] as RpcTx;
          return wallet.sendTransaction({
            to: tx.to,
            data: tx.data,
            value: tx.value ? BigInt(tx.value) : undefined,
            gas: tx.gas ? BigInt(tx.gas) : undefined,
          });
        }
        case "personal_sign":
          return account.signMessage({ message: { raw: p[0] as Hex } });
        case "eth_signTypedData_v4":
          return account.signTypedData(JSON.parse(p[1] as string));
        default:
          return publicClient.request({ method, params } as never);
      }
    },
    on() {},
    removeListener() {},
  };
}

export function demoWallet() {
  return createConnector<ReturnType<typeof demoProvider>>((config) => ({
    id: "demo",
    name: "Demo wallet",
    type: "demo",
    async connect({ isReconnecting } = {}) {
      const key = demoKey(!isReconnecting);
      if (!key) throw new Error("No demo wallet in this browser");
      if (!isReconnecting) await fundDemoWallet(key);
      write(CONNECTED_STORAGE, "1");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { accounts: [privateKeyToAccount(key).address], chainId: anvilLocal.id } as any;
    },
    async disconnect() {
      write(CONNECTED_STORAGE, null);
    },
    async getAccounts() {
      const key = demoKey(false);
      return key ? [privateKeyToAccount(key).address] : [];
    },
    async getChainId() {
      return anvilLocal.id;
    },
    async getProvider() {
      const key = demoKey(false);
      if (!key) throw new Error("No demo wallet in this browser");
      return demoProvider(key);
    },
    async isAuthorized() {
      return read(CONNECTED_STORAGE) === "1" && demoKey(false) !== null;
    },
    async switchChain() {
      return anvilLocal;
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      config.emitter.emit("disconnect");
    },
  }));
}

export const isDemoConnector = (connector?: { id: string }) => connector?.id === "demo";
