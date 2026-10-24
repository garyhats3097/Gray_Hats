# Limitations — Modular DeFi prototype

This is a **local prototype** built in four days to demonstrate one idea: a shared collateral
core with independent financial modules on top. It is **not audited**, **not secure enough for
real funds**, and **must not be deployed to mainnet**.

This document lists what is simplified, what is missing, and what we know is risky, so nobody
mistakes the demo for a production protocol.

Legend: 🔴 security / trust risk · 🟡 financial-model simplification · ⚪ engineering or UX gap

---

## 1. What is real vs. simulated

| Part | Status |
|---|---|
| Shared vault accounting (deposits, locks, settlement) | **Real** smart-contract logic, enforced on-chain and tested |
| Perpetuals and Lending rules | **Real** on-chain logic, deliberately simplified (see §4–5) |
| Collateral token (mUSDC) | **Simulated**: a mock token that anyone can mint for free |
| ETH/USD price | **Real market price** (Coinbase → Kraken → CoinGecko), pushed into a mock oracle every 15 s by `scripts/price-feed.mjs` using the admin test key. Not a decentralised oracle: one key pushes the price, and anyone holding that public test key could still change it from a terminal |
| Market Maker | **Stub**: indicative quotes only, no funded liquidity, no trades (see docs/MARKET_MAKER.md) |
| Perps pool and lending pool liquidity | **Simulated**: 1,000,000 test mUSDC each, seeded by the deploy script. There are no real liquidity providers or lenders |
| Blockchain | Local Anvil node only. `scripts/start-chain.sh` saves it to `.anvil/state.json` on this computer; plain `anvil` forgets everything on restart |
| Activity history | **Real**: built from contract events. Failed attempts are stored only in the current browser |

---

## 2. Scope deliberately left out of v1

- **One collateral asset only (mUSDC, valued at $1).** Multi-asset collateral would need a price
  for every asset, risk discounts ("haircuts") and cross-asset health checks.
- **One perpetuals market** (ETH/USD). The contract supports listing more, but the UI assumes one.
- **No cross-margin.** Each module's lock is separate. A profit in Perps does not raise your
  borrowing capacity in Lending. This makes accounting simpler and safer, but uses capital less
  efficiently than a full cross-margin system.
- **No backend, no Sign-In with Ethereum.** All data comes from the chain, so there is no server
  session to protect. A backend would need SIWE (nonce + expiry + signature check).
- **No chatbot in this repository.** The team plans to add it later as a plugin.
- **No testnet or mainnet deployment.**

---

## 3. Trust and admin risks 🔴

These are the most important limitations. In this prototype the admin and the modules are
**trusted completely**.

1. **Modules are fully trusted by the vault.** Any *active* registered module can call
   `lock(user, amount)` for **any user, without that user's consent**, and then
   `realizeLoss(user, amount)` to move that collateral into its own reserve. It can then send its
   reserve anywhere with `payFromReserve`. A malicious or buggy module could therefore take any
   user's *free* collateral.
   - What protects users today: only the registry owner can register modules.
   - What a production design needs: users opting in per module (an allowance or signed
     authorization), per-module caps, a timelock on registrations, and audits of every module.
2. **A single admin key controls everything.** Anvil account #0 owns the `ModuleRegistry`, the
   `MockOracle` and `PerpsModule.listMarket`. There is no multisig, timelock or governance.
3. **The admin controls the price.** The mock oracle owner can set any price and can therefore
   make any leveraged position liquidatable. A real system needs a decentralized,
   manipulation-resistant oracle (e.g. Chainlink) with staleness and deviation checks.
4. **Oracle staleness checks are turned off** in the deploy script (`maxAge = 0`), so demos don't
   fail when time is skipped. The check exists in `MockOracle` and is covered by a test.
5. **No pause or emergency mode.** If a bug were found there is no way to freeze the vault.
   Disabling a module only stops *new* locks; existing positions can still be closed.
6. **Not upgradeable.** Fixing a contract means redeploying it and migrating state.
7. **Module reserves cannot be withdrawn.** Fees, trading losses and loan interest collect in the
   module reserves forever. There is no treasury or liquidity-provider withdrawal function.

---

## 4. Perpetuals simplifications 🟡

| Topic | Prototype behaviour | Real perpetual exchanges |
|---|---|---|
| Counterparty | The perps pool takes the other side of every trade | Order book or LP pool with risk limits |
| Funding rate | **None** | Periodic funding keeps the perp price near spot |
| Execution price | Exactly the oracle price: no spread, slippage or price impact | Depends on liquidity |
| Margin | Isolated per position; size and leverage fixed at open | Usually adjustable, often cross-margin |
| Leverage | 1x–10x, whole numbers | Varies by market |
| Fees | Flat 0.1% of size on open and on close | Tiered, maker/taker |
| Liquidation | When `margin + PnL ≤ 5% of size`; the **whole margin** goes to the pool, even if some equity is left | Partial liquidations; leftover equity returned |
| Liquidator reward | **None**: nobody is paid to liquidate, so in practice no bot would bother | Keeper incentives |
| Profit when the pool is short of funds | Payout is **capped** at what the pool holds (`ProfitCapped` event). The trader may receive less than they earned | Insurance fund, auto-deleveraging |
| Loss beyond margin | Absorbed silently by the pool (`BadDebt` event only) | Insurance fund / socialised loss |
| Open interest limits | **None** | Caps per market |

---

## 5. Lending simplifications 🟡

| Topic | Prototype behaviour |
|---|---|
| Asset pair | Borrow mUSDC against mUSDC. Because both are worth $1, **price moves never affect a loan**. Only interest changes the health factor, which is why the demo needs time-travel |
| Liquidity | A pool seeded by the deploy script. Nobody can supply liquidity or earn interest |
| Interest | Fixed 5% APR, not linked to how much of the pool is borrowed. Interest is added to the debt each time the loan is touched, so it compounds slightly with frequent interaction |
| Limits | Credit-based: 75% by default, up to 120% (undercollateralized) for the Prime tier, with an unsecured cap of 25% of past repayments and a pool-wide cap of 10%. Liquidation thresholds 85–125% by tier, fixed per loan. See docs/CREDIT.md |
| Liquidation | Whole loan at once (no partial liquidation), with no liquidator reward |
| Bad debt | Shortfalls from liquidated undercollateralized loans are recorded in `totalBadDebt` and absorbed by the pool; the borrower is marked defaulted |
| Repayment | From the wallet only. Repaying directly from vault collateral is not supported |
| Borrowed funds | Sent to the wallet. Re-depositing them as collateral is allowed, so a user can loop leverage |

---

## 5b. Credit scoring 🟡🔴
- Scores use only on-chain history inside this protocol — no identity, so a defaulted user can
  start over with a new address.
- Undercollateralized loans can lose the pool money by design; the caps limit how much.
- Weights and tiers are fixed and uncalibrated (see docs/CREDIT.md).

## 6. Accounting notes 🟡

- **Unrealized profit is never treated as collateral.** It can't be withdrawn or used until the
  position is closed. This is deliberately conservative.
- **Debt is a separate liability.** It is not subtracted from deposits, because the borrowed tokens
  sit in the user's wallet. The UI never adds deposits, P&L and debt into one "net worth" number.
- **Rounding rules:** margin and interest round up (in the protocol's favour), fees round down,
  and P&L rounds toward zero. The differences are at most 1 wei (10⁻¹⁸ mUSDC) per operation.
- **mUSDC uses 18 decimals.** Real USDC uses 6. Supporting real tokens means handling decimals
  per asset.
- **Unusual tokens are not supported**, such as fee-on-transfer or rebasing tokens. The vault
  assumes a plain ERC-20.
- **The invariant `vault balance ≥ deposits + reserves`** is enforced and tested. Tokens sent
  straight to the vault address (not through `deposit`) become a surplus nobody can claim.

---

## 7. Frontend and infrastructure gaps ⚪

- **History reads every event since block 0** on each refresh. That's fine on a fresh local chain
  but slow on a long-lived network. A production app needs an indexer (e.g. a subgraph).
- **Data refreshes every 4 seconds** by polling, not by live subscriptions.
- **The previews copy contract constants** (fees, LTV, thresholds) in
  `modules/*/hooks.ts`. If a constant changes in Solidity, update these too. The contracts
  always re-check everything, so a stale preview can mislead but cannot break accounting.
- **Price history** comes from public APIs and is saved to `frontend/public/eth-history.json` by
  the feed. Without internet, the chart only shows on-chain prices and no new chain can start.
  Candle views use real open/high/low/close from Coinbase or Kraken. CoinGecko and the live
  oracle only give single prices, so candles built from them have small or flat wicks.
- **Lending liquidation through interest takes years** at 5% APR on real time, so it can't be
  shown live in a demo any more (there is no time travel).
- **One network** (Anvil, chain 31337). Contract addresses come from `deployments.json`.
- **The Explorer reads the last 40 blocks** and every user from `Deposited` events on each new
  block. Fine for a local demo; a real deployment needs an indexer.
- **Sharing one chain between computers** exposes Anvil's unlocked test accounts and its
  developer RPC (time travel, balance edits) to everyone on that network.
- **Failed and rejected actions** are kept only in the current browser (`localStorage`).
- **Light theme only** (by design). Basic keyboard and screen-reader support; no full
  accessibility audit.
- **Scan for liquidations** on the Demo page loops over every position. That's fine for a demo,
  not for thousands of positions.

---

## 8. Testing — what was and wasn't verified

**Verified**
- 53 Foundry tests pass: unit, fuzz and invariant tests for the vault accounting rules
  (`docs/ACCOUNTING.md`, I1–I6), Perps, Lending, and an integration test showing a perps
  liquidation cannot touch lending collateral.
- The deploy script was run against a live Anvil chain, and a full user journey was run with
  `cast`. Balances matched hand calculations.
- The full journey (deposit → trade → profit → liquidation → borrow → repay → loan liquidation)
  was run through the real frontend in a headless browser, with no errors, at desktop, tablet and
  phone widths.

**Not verified**
- **No security audit and no formal verification.** Passing tests do not make the contracts safe.
- The browser tests used wagmi's *test wallet connector*, not the real MetaMask extension.
  Do a manual pass with MetaMask before presenting.
- The browser test scripts are not yet committed to the repo or run in CI.
- No gas optimization or load testing.
- The fuzz and invariant tests use modest run counts (256 fuzz runs; 64 × 64 invariant
  sequences).

---

## 9. Before any public deployment

1. Replace mUSDC and `MockOracle` with real tokens and a production oracle.
2. Require user consent for module locks; add per-module caps.
3. Move admin roles to a multisig with a timelock; add a pause mechanism.
4. Add liquidator incentives, partial liquidations, an insurance fund and open-interest caps.
5. Add liquidity-provider deposits and withdrawals for module pools.
6. Index events with a subgraph instead of scanning from block 0.
7. Commission an independent security audit.
8. Deploy to a **testnet** first and document any remaining limitations.

---

## 10. Future roadmap (not started)

Additional modules (market-making, order-book trading), multi-asset collateral with
cross-margin, advanced risk analytics, AI-assisted risk monitoring, multi-chain deployment,
better historical analytics, and a mobile app. None of these should be attempted until the
items in §9 are addressed.
