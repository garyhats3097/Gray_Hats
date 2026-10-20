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
