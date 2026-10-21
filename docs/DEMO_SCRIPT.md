# Demo script — Modular DeFi

**Length:** about 10 minutes (plus an optional 2-minute extra).
**Main message:** *One shared core. Multiple independent modules. Consistent collateral accounting.*

Every number below was checked on a fresh local chain. If you follow the steps in order,
the screen will show exactly these values.

---

## Before the demo (15 minutes earlier)

Do this inside WSL, with two terminals. The numbers below assume a **fresh** chain, so reset first.

```bash
# Terminal 1 — fresh local blockchain + deploy (leave running)
cd ~/Gray_Hats
./scripts/reset-chain.sh      # wipes the saved chain (skip if you want to keep it)
./scripts/start-chain.sh      # starts Anvil, deploys, and saves the chain as you go

# Terminal 2 — the app
cd ~/Gray_Hats/frontend
npm run dev          # http://localhost:5173
```

In MetaMask:
1. Select the **Anvil (local)** network (RPC `http://127.0.0.1:8545`, chain ID `31337`).
2. Select the imported **Anvil account #1** (`0x7099…79C8`). It already holds 100,000 test mUSDC.
3. If you used this account before on an older Anvil run: MetaMask → Settings → Advanced →
   **Clear activity tab data**. Otherwise transactions fail with "nonce too high".
4. If the app was connected before, disconnect it so you can show the welcome screen.

Have these tabs ready: the app, and the architecture slide from your presentation.

> **If the chain stops mid-demo:** run `./scripts/start-chain.sh` again — it reloads the saved
> chain exactly where you left off. No redeploy, no MetaMask reset needed.
>
> **Showing the chain itself:** the **Explorer** page lists every block and transaction live.
> Click any transaction to show the decoded function call and the events it emitted — a good
> way to prove the numbers come from the blockchain.

---

## Act 1 — The problem and the idea (1 min, slides)

> "In DeFi today, every product keeps its own collateral and its own accounting. Your money
> ends up split across trading, lending and other apps, and nobody sees the full picture.
> Modular DeFi puts one shared vault and one ledger at the center, and lets independent
> financial products plug into it — without ever double-counting your collateral."

Show the architecture slide: **CoreVault** in the middle, **Perpetuals** and **Lending** as modules.

---

## Act 2 — Connect and deposit (1.5 min)

1. Open the app. The **welcome screen** appears.
   > "We only use the wallet address. No email, no password, and we never ask for a seed phrase."
2. Click **Connect Wallet** → approve in MetaMask. The **Portfolio** opens with an empty state.
3. Go to **Shared Vault**. Type **5000**.
   - Click **Approve mUSDC** → confirm in MetaMask.
     > "Step one: we let the vault move exactly 5,000 tokens. Not unlimited."
   - Click **Deposit** → confirm.
4. Point out:
   - Deposited **$5,000.00**, Available **$5,000.00**, Locked **$0.00**.
   - The donut is 100% "Available".
   - The deposit appears under **Recent vault activity**, read straight from the blockchain.

---

## Act 3 — Perpetuals uses the shared collateral (2 min)

1. Go to **Perpetuals**. Mark price is **$3,000.00**.
2. Choose **Long**, size **3000**, click **10x**. Before confirming, read the preview:
   - Required margin **$300.00** (size ÷ leverage)
   - Opening fee **$3.00** (0.1%)
   - Est. liquidation price **$2,850.00**
   - The amber warning: a 5% move against you can liquidate the position.
3. Click **Open Long** → confirm.
4. Go to **Shared Vault**:
   - Deposited **$4,997.00** (the $3 fee went to the perps pool)
   - Available **$4,697.00**
   - Perpetuals **$300.00**, shown in indigo on the donut.
   > "The trading module didn't take our tokens. It asked the core to **lock** $300 of our
   > deposit. That $300 is still ours, but we can't withdraw it or use it anywhere else."

---

## Act 4 — Lending uses the same vault, without overlap (1.5 min)

1. Go to **Lending** → **Allocate** tab → **1000** → **Allocate** → confirm.
2. **Borrow** tab → type **600**. Point at the preview: health factor **No debt ∞ → Healthy 1.41**.
   Click **Borrow** → confirm. The $600 arrives in the wallet.
   > "These borrowed tokens come from a lending pool seeded by our deploy script. That's test
   > money; there are no real lenders in this prototype."
3. Go to **Portfolio**:
   - Allocation bar: Available **$3,697.00**, Perpetuals **$300.00**, Lending **$1,000.00**
   - Lending health gauge **1.41 Healthy**, debt **$600.00**
   > "One deposit, two products. The parts add up to exactly what we deposited. Nothing is
   > counted twice."
4. **Show a rejection.** Go to **Shared Vault** → **Withdraw** → type **4000**.
   The form says *"Exceeds your available (unlocked) collateral"* and the button stays disabled.
   > "The app knows only $3,697 is free. And even if someone bypassed the app, the smart
   > contract itself rejects any withdrawal larger than the free balance. That's tested."

---

## Act 5 — Price moves: profit, then a liquidation (2.5 min)

**Profit**
1. Go to **Demo controls** and click **+5%** (price becomes **$3,150.00**).
   > "This is a mock oracle, so we can move the price on demand."
2. Go to **Perpetuals**. The chart steps up. The position shows **+$150.00** (+50% on margin).
3. Click **Close**. The dialog shows: net settlement **+$147.00**, returned to available **$447.00**.
   Click **Confirm close** → confirm.
4. **History** tab: realized **+$147.00**. Deposited is now **$5,144.00**.

**Liquidation** (this is the key architecture moment)
5. Open another **Long**, size **2000**, **10x** (margin $200, est. liquidation **$2,992.50**) → confirm.
6. **Demo controls** → **−10%** (price **$2,835.00**). Wait a few seconds: position #2 appears
   under **Liquidations**. Click **Liquidate** → confirm.
   > "Anyone can liquidate an unhealthy position. Here we do it ourselves."
7. Go to **Shared Vault** or **Portfolio**:
   - Deposited **$4,942.00**: we lost exactly that position's $200 margin plus its $2 fee.
   - **Lending collateral is still $1,000.00.**
   > "This is the core rule of the system: a loss in one module can only come out of the
   > collateral **that module** locked. The perps liquidation could not touch our loan's
   > collateral. The vault enforces it, not the modules."

---

## Act 6 — Repay, release, and the full history (1 min)

1. **Lending** → **Repay** → **MAX**. The button reads **Approve mUSDC** (it includes a small
   buffer for interest) → confirm. Then **Repay full loan** → confirm.
2. **Release** tab → **MAX** → **Release** → confirm.
3. **Portfolio**: Deposited **$4,942.00**, Available **$4,942.00**, nothing locked, no debt.
4. **Activity**: every step is listed, with what each one did to your collateral.
   Filter **Module → Perpetuals**, then **Lending**.

---

## Optional extra — Lending liquidation through interest (2 min)

Lending health only changes through interest (collateral and debt are both mUSDC), so we skip time.

1. **Lending** → **Allocate** 1000 → **Borrow** **MAX** (≈ $750). Health ≈ **1.13 At risk**.
2. **Demo controls** → **+3 years**. Go to **Lending**: health factor below 1.00 and a red
   **"Your loan can be liquidated now"** banner.
3. **Demo controls** → **Liquidate** the loan. Debt plus a 5% penalty is taken from the
   lending collateral, and the rest is released.

---

## Closing (30 s)

> "Adding a third product — say, a market-making module — means writing one contract against
> the core's interface, registering it, and adding one line to the frontend's module list.
> The core doesn't change. One core, multiple financial products."

Then point to [`LIMITATIONS.md`](LIMITATIONS.md): it's a prototype, and we know exactly where.

---

## Likely questions — short answers

| Question | Answer |
|---|---|
| Where does trading profit come from? | The perps pool: the module's reserve inside the vault, seeded by the deploy script. Losses and fees flow into it. |
| Who lends the money? | Nobody real. The lending pool is test money seeded at deploy. |
| Can a module steal funds? | Modules are admin-approved and fully trusted in this prototype. See LIMITATIONS §3. |
| Why only one token? | Multi-asset collateral needs per-asset prices and risk discounts. We kept v1 small and correct. |
| Is it secure? | 53 automated tests pass, including fuzz and invariant tests on the accounting. It is **not audited** and not ready for real money. |
| Is the price real? | No. It's a mock oracle we control for demos. |
| What if a transaction fails? | The app checks it before your wallet opens and explains why in plain English. |

## If something goes wrong

| Symptom | Fix |
|---|---|
| "Nonce too high" or transactions stuck | MetaMask → Settings → Advanced → Clear activity tab data |
| Balances are all zero | Plain `anvil` was started instead of `./scripts/start-chain.sh`, so the chain is empty. Stop it and run the script |
| "Wrong network" banner | Click **Switch network**, or pick Anvil (local) in MetaMask |
| Demo controls show an error | Anvil isn't running at `127.0.0.1:8545` |
| Liquidation list is empty right after a price change | Wait about 5 seconds; it rescans automatically |
| Contract addresses changed / the app shows a different vault address | An old Anvil was still running, so you deployed onto it. Close every Anvil terminal, start one fresh `anvil`, deploy again. A fresh deploy always gives the vault address `0xCf7E…0Fc9` |
