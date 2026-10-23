# Demo script — Modular DeFi

**Length:** about 10 minutes.
**Main message:** *One shared core. Multiple independent modules. Consistent collateral accounting.*

The ETH price is the **real market price**, so exact dollar values differ every time. The
formulas below tell you what to expect; the screen always shows the real result.

---

## Before the demo (15 minutes earlier)

Inside WSL, two terminals. Internet is required (real ETH price).

```bash
# Terminal 1 — fresh chain at the real ETH price + live price feed (leave running)
cd ~/Gray_Hats
./scripts/reset-chain.sh      # start from empty data (skip to keep your chain)
./scripts/start-chain.sh      # look for: ">>> Live ETH price feed running"

# Terminal 2 — the app
cd ~/Gray_Hats/frontend
npm run dev                   # http://localhost:5173
```

In MetaMask:
1. Select the **Anvil (local)** network (RPC `http://127.0.0.1:8545`, chain ID `31337`).
2. Select the imported **Anvil account #1** (`0x7099…79C8`). It holds 100,000 test mUSDC.
3. After a reset: MetaMask → Settings → Advanced → **Clear activity tab data**.
4. Disconnect the app if it was connected, so you can show the welcome screen.

> **If the chain stops mid-demo:** run `./scripts/start-chain.sh` again. It reloads the saved
> chain exactly where you left off and restarts the live price feed.

---

## Act 1 — The problem and the idea (1 min, slides)

> "In DeFi today, every product keeps its own collateral and accounting. Modular DeFi puts one
> shared vault and one ledger at the centre, and lets independent financial products plug into
> it — without ever double-counting your collateral."

---

## Act 2 — Connect and deposit (1.5 min)

1. Open the app → **Connect Wallet** → approve in MetaMask. The Portfolio shows an empty state.
2. **Shared Vault** → type **5000** → **Approve mUSDC** → **Deposit**.
3. Point out: Deposited **$5,000**, Available **$5,000**, Locked **$0**, and the deposit in
   **Recent vault activity** (read straight from the blockchain).

---

## Act 3 — Real market data (1 min)

1. **Perpetuals.** The chart shows the **real ETH price**: switch between **1D / 7D / 30D / 1Y**.
   > "This is real market history, and the line continues with the live on-chain price the
   > contracts use. It updates every 15 seconds. Nobody — including us — can set it from the site."
2. Point at **Mark price** and **24h change**.

---

## Act 4 — Perpetuals uses the shared collateral (2 min)

1. **Long**, size **3000**, click **10x**. Read the preview:
   - Required margin **$300** (size ÷ leverage), opening fee **$3** (0.1%)
   - Est. liquidation price ≈ **95% of the current price** (a 5% drop liquidates at 10x)
2. **Open Long** → confirm. A dashed **Entry** line appears on the chart.
3. **Shared Vault**: Deposited **$4,997**, Perpetuals **$300** locked, Available **$4,697**.
   > "The trading module asked the core to **lock** $300 of our deposit. It is still ours, but
   > it can't be withdrawn or used anywhere else."
4. Back on **Perpetuals**: the P&L moves with the real price. Every 1% the price moves changes
   this position by about **$30** (1% of $3,000).

---

## Act 5 — Lending uses the same vault, without overlap (2 min)

1. **Lending** → **Allocate** **1000** → confirm.
2. **Borrow** **600**. The preview shows health **No debt ∞ → Healthy 1.41**
   (1,000 × 85% ÷ 600). Confirm; $600 arrives in the wallet.
   > "Borrowed tokens come from a pool seeded at deploy — test money, no real lenders."
3. **Portfolio**: Available **$3,697**, Perpetuals **$300**, Lending **$1,000** — the parts add
   up to the deposit. Nothing is counted twice.
4. **Rejection:** **Shared Vault** → **Withdraw** → **4000**. The form refuses ("Exceeds your
   available collateral"), and the contract would refuse too.

---

## Act 6 — Close, repay, and show the chain (2 min)

1. **Perpetuals** → **Close**. The dialog shows the real P&L, the $3 closing fee and the net
   amount returned. Confirm. **History** shows the realized result.
2. **Lending** → **Repay** → **MAX** → **Approve mUSDC** → **Repay full loan**, then
   **Release** → **MAX** → **Release**.
3. **Explorer**: every transaction with its decoded function and events, the vault's live
   **Solvent** check, all users, and the **Liquidations** list (real unhealthy positions, if any).
   Click the `openPosition` transaction to show the vault locking the margin.

---

## Act 7 — Market Maker module (1 min)

1. **Market Maker**: bid and ask around the **same** oracle price, spread 0.30%.
2. Change the spread to **50** bps → **Save**. Bid and ask move apart.
3. Point at **"Indicative — not executable"** and the liquidity panel: quotes only, no funded
   inventory yet.
   > "A third module, added with one line in the frontend and no change to the core."

---

## Closing (30 s)

> "One core, multiple financial products: one deposit, one ledger, real market prices, and a
> core that guarantees a loss in one product can't touch collateral held by another."

Then point to [`LIMITATIONS.md`](LIMITATIONS.md).

---

## Likely questions — short answers

| Question | Answer |
|---|---|
| Is the price real? | Yes: Coinbase (falls back to Kraken, CoinGecko), pushed on-chain every 15 s. The oracle itself is a simple prototype contract, not a decentralised oracle. |
| Can you change the price or time? | Not from the site. There are no price or time controls. |
| Where does trading profit come from? | The perps pool inside the vault, seeded at deploy. Losses and fees flow into it. |
| Who lends the money? | Nobody real; the lending pool is test money seeded at deploy. |
| Can a module steal funds? | Modules are admin-approved and fully trusted in this prototype. See LIMITATIONS §3. |
| Is it secure? | 69 automated tests pass, including fuzz and invariant tests. It is **not audited**. |

## If something goes wrong

| Symptom | Fix |
|---|---|
| "Can't start a new chain without the real ETH price" | No internet. Connect and run the script again |
| Chart says "Waiting for real price data" | The feed hasn't saved history yet (wait ~10 s) or there's no internet; see `.anvil/price-feed.log` |
| Trading fails with "oracle price is out of date" | The feed stopped for 15+ minutes. Restart with `./scripts/start-chain.sh` |
| "Nonce too high" or stuck transactions | MetaMask → Settings → Advanced → Clear activity tab data |
| Red "can't reach the blockchain" banner | The chain isn't running: `./scripts/start-chain.sh` |
