# Modular DeFi — site guide for the assistant

Modular DeFi (team Gray Hats, tagline "One Core. Multiple Financial Products.") is a **prototype**.
One shared collateral vault (the "core", contract CoreVault) holds each user's deposit. Independent
financial products ("modules") lock and unlock parts of that deposit through the core, so the same
dollar can never be used twice.

Everything runs on a **local test blockchain** (Anvil, chain ID 31337, RPC http://127.0.0.1:8545)
with **test tokens** called mUSDC (mock USD coin, 1 mUSDC = $1). Nothing has real money value.
The contracts are not audited and must never be deployed to mainnet.

## Pages (left sidebar)

- **Portfolio** — overview: total deposited, available (free), locked by modules, unrealized
  perps P&L, a bar showing how the deposit is split, wallet balance, outstanding loan. New users see
  a "Get started" screen.
- **Shared Vault** — get 10,000 test mUSDC from the faucet, approve, deposit into the vault,
  withdraw free collateral. Shows per-module locks and recent vault activity.
- **Perpetuals** (module 01) — trade ETH long or short with leverage on the real ETH price.
  Price chart (ranges 1H / 1D / 7D / 30D / 1Y, line or other chart type), entry markers
  (green ▲ = long entry, red ▼ = short entry), trade panel, open positions, history.
- **Lending** (module 02) — allocate vault collateral to Lending, borrow mUSDC, repay, release
  collateral. Shows the credit profile (score, tier, what builds the score).
- **Market Maker** (module 03) — quote-only stub: shows an indicative bid and ask around the oracle
  ETH price with a configurable spread. Quotes are **not executable**; no funded inventory.
- **Activity** — the connected user's transactions, read from the blockchain.
- **Explorer** — the chain itself: latest blocks, every transaction decoded, live vault solvency
  check, all users, and a Liquidations list (anyone can liquidate unhealthy positions/loans).
  Works without a wallet.
- **Help & Setup** — MetaMask setup and troubleshooting. Works without a wallet.

## How the money moves

1. Wallet → vault: **Deposit** (needs a one-time **Approve** of mUSDC first). The money is now
   "deposited" and "available" (free).
2. Vault → module: a module **locks** part of your free collateral (opening a perp position locks
   its margin; "Allocate" in Lending locks collateral). Locked money is still yours but cannot be
   withdrawn or used by another module.
3. Module → vault: closing a position / releasing collateral **unlocks** it again.
4. Vault → wallet: **Withdraw** only up to your free (unlocked) amount.

Key rule: free = deposited − total locked. A loss in one module can only take collateral that module
locked; it can never touch money locked by another module.

Important difference: the **wallet balance** (mUSDC in MetaMask) is not in the vault. To use it in
any module you must first deposit it into the Shared Vault. Lending's "Allocate" uses the vault's free
collateral, not the wallet. Lending has a "Deposit from wallet" button for that.

## Perpetuals rules

- Market: ETH/USD, price from the on-chain oracle, which is updated with the **real** ETH price
  (Coinbase, fallback Kraken, then CoinGecko) every ~15 seconds by a feed script.
- Leverage 1x–10x. Margin = size ÷ leverage. Minimum size $10.
- Fee: 0.1% of size when opening and again when closing.
- Maintenance margin 5%: a position becomes liquidatable when its margin plus P&L falls below 5% of
  its size. At 10x, a move of roughly 5% against you liquidates it.
- Liquidation: anyone can liquidate; the whole margin goes to the perps pool. A perps liquidation
  costs 10 credit points.
- P&L ≈ size × (price change %). Profits are paid from the perps pool in the vault (seeded at
  deploy with test money); profit is capped by what the pool holds.
- If the price feed stops for more than 15 minutes the oracle reports the price as out of date and
  trading stops until the feed runs again.

## Lending rules

- Collateral and loans are in mUSDC. Interest: simple 5% APR, accrues every second.
- Borrowed mUSDC goes to the **wallet**. Repaying takes mUSDC from the wallet (needs an Approve
  first).
- Borrow limit = tier LTV × collateral (also limited by pool liquidity).
- Health factor = collateral × liquidation threshold ÷ debt. Below 1.0 the loan can be liquidated
  by anyone: debt + 5% penalty is taken from the collateral, the rest is unlocked.
- A lending liquidation (default) sets the credit score to 0 **permanently**.
- The lending pool is test money seeded at deploy — there are no real lenders.

### Credit score (0–100) and tiers — from the CreditRegistry contract

Points:
- Loans repaid in full: +10 each (max 30)
- Total amount repaid: +1 per $100 (max 30)
- Account age (since first loan or trade): +1 per hour (max 10)
- Vault deposit: +1 per $500 deposited (max 30)
- Perpetuals liquidations: −10 each
- Any lending default: score 0 forever

Tiers (max loan-to-value / liquidation threshold):
- Standard (0–39): 75% / 85%
- Trusted (40–69): 90% / 95%
- Established (70–84): 100% / 105%
- Prime (85+): 120% / 125% — **undercollateralized loans** (borrow more than the collateral).

Prime caps: the part above the collateral may be at most 25% of everything the user has repaid
(the "unsecured allowance"), and all unsecured debt together may use at most 10% of the lending pool.
A loan keeps the liquidation threshold it was opened with.

Fast way to build score in the demo: deposit a good amount (e.g. $15,000 gives 30 portfolio points),
allocate collateral, borrow and repay in full a few times.

## Market Maker (stub)

- Quote = oracle mid price ± half the spread. Spread 5–1000 basis points (0.05%–10%), default 30.
- The owner or an operator (Anvil account #1 in the demo) can change the spread, enable/disable
  quoting and publish a quote. Status: quoting, disabled, price unavailable/stale.
- Liquidity panel shows no funded inventory: quotes are indicative only. Future work: inventory from
  the vault, execution, risk limits.

## Wallet and network setup

Two ways to connect (button **Connect Wallet**, top right, or on the welcome screen):
- **MetaMask** (your own wallet).
- **Demo wallet** ("Don't have a wallet? Try with a demo wallet"): no install. The site creates a random test
  account in this browser, gives it test ETH for fees and 10,000 test mUSDC, and signs transactions without
  pop-ups. A yellow "Demo" badge shows next to the address. The same account comes back after a reload in the same
  browser; clearing site data or using another browser gives a new one. The account menu has **Start fresh** (new
  empty demo account) and **Disconnect**. Test money only.

MetaMask setup:
- Help & Setup page → **Add Anvil (local) to MetaMask** button adds the network in one click. Or add it by hand: RPC URL http://127.0.0.1:8545, chain ID 31337, currency ETH. Name e.g.
  "Anvil (local)". The chain must be started first with `./scripts/start-chain.sh` (inside WSL on
  Windows).
- **Get test mUSDC** (Shared Vault page) also gives a new account test ETH for transaction fees if it has none.
- Team laptops can instead import the test account the team uses (Anvil account #1, address 0x7099…79C8) with its **public
  test key** from the Help page. Test keys are public — never use them on a real network, and never
  put real funds in them.
- The site never asks for a private key or seed phrase. Never share yours with anyone, including this
  assistant.

## Troubleshooting

- **MetaMask says "Transaction failed" but the site shows it confirmed / MetaMask Activity is
  missing transactions:** MetaMask keeps old transactions from previous chain runs. After a chain
  reset, nonces start at 0 again and collide with the old records. Fix: MetaMask → Settings →
  Advanced → **Clear activity tab data**, after every chain reset. The site's Activity and Explorer
  pages read the chain directly and are the reliable record.
- **"Nonce too high" or stuck transactions:** same fix (clear activity tab data).
- **MetaMask shows "Sent ETH −0 ETH" for contract calls:** normal on a local network — MetaMask cannot
  decode our contracts. No ETH was sent.
- **Red banner "Can't reach the blockchain":** the chain isn't running. Run `./scripts/start-chain.sh`.
- **Banner "This chain doesn't have the Modular DeFi contracts":** a plain `anvil` was started. Stop
  it (Ctrl+C) and run `./scripts/start-chain.sh`.
- **Data disappeared:** a plain `anvil` forgets everything. `start-chain.sh` saves the chain in
  `.anvil/state.json`; `reset-chain.sh` deletes it on purpose.
- **"Oracle price is out of date" / chart empty:** the price feed stopped or there's no internet.
  Restart `./scripts/start-chain.sh`; log in `.anvil/price-feed.log`.
- **Wrong network banner:** switch MetaMask to the Anvil (local) network (button on the banner).
- **Lending: "Allocate" is blocked although the wallet has money:** the vault's free collateral is 0.
  Deposit from the wallet into the vault first, then allocate.
- **Borrow limit lower than 120%:** 120% is only for the Prime tier. Standard is 75%.
- **Can't withdraw:** only free collateral can be withdrawn; close positions / repay and release
  Lending collateral first.
- **MetaMask "Send failed" on Ethereum mainnet/other networks:** the account has no real ETH there;
  use the Anvil (local) network.

## Prototype limits (short)

Mock token and mock oracle (a script pushes the real price; not a decentralised oracle), modules are
admin-approved and fully trusted, no real lenders, one market (ETH), not audited, local chain only.
Full list: docs/LIMITATIONS.md in the repository.

## Trusted external resources

- Ethereum basics: https://ethereum.org/en/learn/
- MetaMask help: https://support.metamask.io/
- DeFi concepts: https://ethereum.org/en/defi/
- Prices and market data: https://www.coingecko.com/en/coins/ethereum
- Crypto news: https://www.coindesk.com/ and https://www.theblock.co/
- Foundry (Anvil, forge, cast): https://book.getfoundry.sh/

## Glossary

- **Collateral:** money you lock to back a loan or a trade.
- **Shared vault / core:** the one contract that holds every user's deposit and the ledger of who
  locked what.
- **Free / available collateral:** deposited minus locked; can be withdrawn or used.
- **Lock / unlock:** a module reserving part of your deposit / giving it back.
- **Perpetual (perp):** a futures-like trade with no expiry; you profit if the price moves your way.
- **Long / short:** betting the price goes up / down.
- **Leverage:** trading a size larger than your margin (10x = $100 margin controls $1,000).
- **Margin:** the collateral locked behind a position.
- **Mark / oracle price:** the price the contracts use (here: the real ETH price pushed on-chain).
- **Unrealized / realized P&L:** profit or loss while open / after closing.
- **Liquidation:** forced closing of a position or loan that has become too risky.
- **Maintenance margin:** the minimum margin (5% of size here) a position must keep.
- **LTV (loan-to-value):** debt ÷ collateral. Max LTV = how much you may borrow per $1 collateral.
- **Liquidation threshold:** the LTV at which a loan becomes liquidatable.
- **Health factor:** collateral × liquidation threshold ÷ debt; below 1 = liquidatable.
- **APR:** yearly interest rate (here 5%, simple).
- **Undercollateralized loan:** a loan larger than its collateral, allowed only with good credit.
- **Credit score / tier:** on-chain reputation from repayments, deposits and history.
- **Bad debt:** debt that collateral could not cover after a liquidation.
- **Spread / bid / ask:** the gap between the price a market maker buys (bid) and sells (ask) at.
- **Basis point (bps):** 0.01%. 30 bps = 0.30%.
- **Gas:** the fee paid in ETH for a transaction (free test ETH on Anvil).
- **Nonce:** a counter of transactions sent by an account.
- **Approve / allowance:** permission for a contract to move your tokens.
- **Faucet:** gives free test tokens.
- **Anvil:** Foundry's local test blockchain.
- **Smart contract:** a program on the blockchain.
