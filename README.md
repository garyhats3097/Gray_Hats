# Modular DeFi — Gray Hats

**One Core. Multiple Financial Products.**

A local prototype: one shared collateral vault (`CoreVault`) with independent modules
(Perpetuals, Lending) that lock, unlock and settle collateral through the core.

> ⚠️ Prototype only. Mock tokens, mock oracle, local Anvil chain. Not audited. Never deploy to mainnet.
> See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

**Docs:** [Accounting model](docs/ACCOUNTING.md) · [Market Maker](docs/MARKET_MAKER.md) · [Demo script](docs/DEMO_SCRIPT.md) · [Limitations](docs/LIMITATIONS.md)

## Repository layout
```
contracts/   Foundry project (Solidity)
  src/core/        CoreVault, ModuleRegistry      ← never edited to add a module
  src/interfaces/  ICoreVault, IModule, ...
  src/modules/     one folder per module
  src/mocks/       MockERC20, MockOracle (test-only)
  test/            core/, modules/, integration/
frontend/    React + TypeScript + Vite + wagmi/viem + Tailwind
  src/core/        app shell, shared UI kit, vault hooks   ← never edited to add a module
  src/modules/     one folder per module (page + module.ts manifest)
  src/modules.ts   list of mounted modules (sidebar + routes)
  src/pages/       Portfolio, Vault, Activity, Explorer, Help
  src/config/      chain, contract addresses (auto-written) and ABIs (generated)
scripts/     start-chain.sh / reset-chain.sh (saved local chain), price-feed.mjs (real ETH price, started automatically)
docs/        ACCOUNTING.md, DEMO_SCRIPT.md, LIMITATIONS.md
```

## Getting started (Windows)
Foundry needs **WSL** (Ubuntu) on Windows. In VS Code, install the "WSL" extension and open
this folder inside WSL.

```bash
# inside WSL
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc
foundryup

git clone --recurse-submodules https://github.com/garyhats3097/Gray_Hats.git
cd Gray_Hats/contracts
forge build
forge test
```
If you cloned without `--recurse-submodules`, run `git submodule update --init --recursive`.

## Running the app locally
Two terminals, both inside WSL on Windows.

```bash
# Terminal 1 — local blockchain (leave it running)
./scripts/start-chain.sh
#   first run: starts Anvil, deploys the contracts, saves the chain to .anvil/state.json
#   later runs: reloads the saved chain — balances, positions, loans and history are kept

# Terminal 2 — frontend
cd frontend
npm install        # first time only
npm run dev        # open http://localhost:5173
```
Then set up MetaMask as described on the app's **Help & Setup** page: add the network
`http://127.0.0.1:8545`, chain ID `31337`, and import Anvil test account #1.

Stop the chain with **Ctrl+C** (it is saved on exit and every 5 seconds).
To start over with an empty chain: `./scripts/reset-chain.sh`, then `./scripts/start-chain.sh`,
and in MetaMask: Settings → Advanced → **Clear activity tab data**.

`start-chain.sh` refuses to start if another chain (for example a plain `anvil`) already uses
port 8545, because that chain would not be saved. The site also shows a red banner when it can't
reach the chain, or when the chain doesn't have the contracts.

> Don't run `Deploy.s.sol` by hand on a saved chain — it creates new, empty contracts and the
> app switches to them. `start-chain.sh` only deploys on a fresh chain.

### Real ETH prices (automatic)
`start-chain.sh` connects the chain to the **real ETH market**:
- a new chain starts at the real current ETH price (internet required);
- `scripts/price-feed.mjs` runs in the background and pushes the real price into the oracle every
  15 seconds (Coinbase → Kraken → CoinGecko, public, no key). Log: `.anvil/price-feed.log`;
- it also saves real price history (1D / 7D / 30D / 1Y) that the price chart shows;
- the oracle rejects prices older than 15 minutes, so trading stops if the feed stops.

There are no controls in the site to change the price or the chain's clock.

### Market Maker module
A quote-only stub: indicative bid/ask around the oracle price with a configurable spread. See
[docs/MARKET_MAKER.md](docs/MARKET_MAKER.md). Existing saved chains get it automatically the next
time `./scripts/start-chain.sh` runs; nothing else is redeployed.

### Several users
Every wallet address has its own position in the vault.
- **Same computer:** import Anvil test accounts #2 and #3 into MetaMask (their keys are printed
  when Anvil starts) and switch accounts. The app follows the account selected in MetaMask.
- **Several computers sharing one chain:** run the chain and the site on one host computer.
  Other people point MetaMask at `http://HOST_IP:8545` and open `http://HOST_IP:5173`.
  On the host, copy `frontend/.env.example` to `frontend/.env.local`, set
  `VITE_RPC_URL=http://HOST_IP:8545`, and start the site with `npm run dev -- --host`.
  Windows Firewall must allow ports 8545 and 5173, and WSL needs mirrored networking.
  Anyone on that network can then use the chain, including its public test keys, so only do
  this on a network you trust.

### Explorer
The **Explorer** page shows the chain itself: latest blocks, every transaction with its decoded
function call and events, a live solvency check of the vault, and every user's position.
It works without connecting a wallet.

After changing a contract: `cd contracts && forge build && cd ../frontend && npm run sync-abis`.

### Adding a module
1. Write the contract in `contracts/src/modules/<name>/`, using only `ICoreVault`.
2. Register it in `Deploy.s.sol` with `registry.registerModule(...)`.
3. Create `frontend/src/modules/<name>/` with a page and a `module.ts` manifest.
4. Add one line to `frontend/src/modules.ts`.
