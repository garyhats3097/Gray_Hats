# Market Maker module (quote-only stub)

Status: **stub — not complete.** It publishes indicative quotes; it does not trade.

## What it does
- **Quotes:** bid = mid × (1 − spread/2), ask = mid × (1 + spread/2), where *mid* is the price
  from the **same oracle** Perpetuals uses. Bid rounds down and ask rounds up, so the quoted
  spread is never narrower than configured.
- **Spread:** set in basis points (100 bps = 1%), limited to **5–1,000 bps** (0.05%–10%).
  Enforced by the contract; the page validates too.
- **Access control:** the owner (Anvil #0) adds operators. The deploy script makes test
  account #1 an operator so the demo can change settings. Only the owner/operators can change
  the spread or quote size, pause/resume, or publish a quote snapshot.
- **Pause/resume:** operators can stop quoting. Quoting also stops automatically when the
  oracle price is missing or stale (`quoteStatus` returns a status code instead of reverting).
- **History:** listing, operator changes, spread/size changes, pause/resume and published quote
  snapshots are events, shown on the Market Maker page.

## How it uses the shared core
- Registered in the existing **ModuleRegistry** like Perps and Lending.
- Uses the existing **oracle** for its reference price.
- Its liquidity is **its reserve inside the existing CoreVault** (`vault.moduleReserve`). No
  separate vault, no duplicate ledger.
- It **locks no user collateral** and never calls `lock`/`realizeLoss`, so it cannot affect
  anyone's deposit (tested).

## Indicative vs. executable
A quote is **indicative**: it shows the price, not a promise to trade.
- *Indicative size* = configured max quote size (default $10,000 per side).
- *Executable bid side* = min(indicative size, funded liquidity). Funded liquidity is $0 unless
  someone funds the module's reserve (`vault.fundReserve(marketMaker, amount)`).
- *Executable ask side* = 0: the vault holds only mUSDC, so there is no ETH inventory to sell.

## Files
| File | Purpose |
|---|---|
| `contracts/src/interfaces/IQuoter.sol` | Shared quote interface |
| `contracts/src/modules/marketmaker/MarketMakerModule.sol` | Quote maths, config, status |
| `contracts/test/modules/marketmaker/MarketMakerModule.t.sol` | 15 tests (maths, rounding, oracle, limits, access, pause, vault) |
| `contracts/script/MarketMakerSetup.sol` | Shared deploy steps (CREATE2 → same address everywhere) |
| `contracts/script/AddMarketMaker.s.sol` | Adds the module to an existing saved chain |
| `frontend/src/modules/marketmaker/` | Dashboard page (one line in `modules.ts` mounts it) |

## Next steps (not built)
1. Funded liquidity: let users allocate collateral to the module through `vault.lock`.
2. Execution: `swap`/`fill` against the quote, settling through the vault.
3. ETH inventory (needs multi-asset vault support).
4. Dynamic spreads based on volatility or inventory.
