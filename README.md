# Modular DeFi — Gray Hats

**One Core. Multiple Financial Products.**

A local prototype: one shared collateral vault (`CoreVault`) with independent modules
(Perpetuals, Lending) that lock, unlock and settle collateral through the core.

> ⚠️ Prototype only. Mock tokens, mock oracle, local Anvil chain. Not audited. Never deploy to mainnet.

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
  src/pages/       Portfolio, Vault, Activity, Help
  src/config/      chain, contract addresses (auto-written) and ABIs (generated)
docs/        ACCOUNTING.md and other design notes
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
You need three terminals (all inside WSL on Windows).

```bash
# Terminal 1 — local blockchain (leave it running)
anvil

# Terminal 2 — deploy contracts (re-run every time you restart Anvil)
cd contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Terminal 3 — frontend
cd frontend
npm install        # first time only
npm run dev        # open http://localhost:5173
```
Then set up MetaMask as described on the app's **Help & Setup** page: add the network
`http://127.0.0.1:8545`, chain ID `31337`, and import Anvil test account #1.

After changing a contract: `cd contracts && forge build && cd ../frontend && npm run sync-abis`.

### Adding a module
1. Write the contract in `contracts/src/modules/<name>/`, using only `ICoreVault`.
2. Register it in `Deploy.s.sol` with `registry.registerModule(...)`.
3. Create `frontend/src/modules/<name>/` with a page and a `module.ts` manifest.
4. Add one line to `frontend/src/modules.ts`.
