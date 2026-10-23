# Credit-based and undercollateralized lending

Users with a strong **on-chain history in this protocol** can borrow more — up to **120% of their
collateral** (more than they put up). Everything is computed and enforced by contracts.

## Where it lives
- `contracts/src/core/CreditRegistry.sol` — part of the shared core's risk layer. Registered
  modules report activity; anyone can read a score. Reusable by any future module.
- Lending reports loans repaid and defaults; Perpetuals reports activity and liquidations.
- `LendingModule` reads the user's terms from the registry when they borrow or release collateral.

## The score (0–100)
| Signal | Points |
|---|---|
| Loans repaid in full | +10 each, max 30 |
| Total amount repaid | +1 per $100, max 30 |
| Account age (from first loan or trade) | +1 per hour, max 10 |
| Vault deposit (portfolio) | +1 per $500, max 30 |
| Perpetuals liquidations | −10 each |
| **Any lending liquidation (default)** | **score 0 forever** |

## Tiers
| Tier | Score | Max loan-to-value | Liquidation at |
|---|---|---|---|
| Standard | 0–39 | 75% | 85% |
| Trusted | 40–69 | 90% | 95% |
| Established | 70–84 | 100% | 105% |
| **Prime** | 85–100 | **120%** (undercollateralized) | 125% |

## Safety rules for unsecured lending
1. **Anti-gaming cap:** the part above the collateral may never exceed **25% of everything the user
   has repaid before**. Borrowing and repaying tiny amounts cannot unlock a big unsecured loan.
2. **Pool-wide cap:** all unsecured debt together may use at most **10% of the lending pool**.
3. **Threshold is fixed per loan:** a loan keeps the liquidation threshold of the tier it was taken
   under, so a later score change never makes it liquidatable by itself.
4. **Default:** if an undercollateralized loan is liquidated, all its collateral is taken, the
   shortfall is recorded as **bad debt** (`totalBadDebt`, absorbed by the pool), and the user is
   marked defaulted — score 0, Standard tier only, for good.

The vault stays solvent in every case: the pool already paid the borrowed tokens out, so a default
only reduces the pool (tested).

## Example (as tested)
Deposit $20,000 → allocate $2,000 → borrow and fully repay $1,000 three times:
score 30 → 50 (Trusted) → 70 (Established) → **90 (Prime)**, unsecured allowance **$750**,
borrow limit **$2,400** on $2,000 collateral, health 1.04.

## Known limitations (prototype)
- History only counts activity **inside this protocol**; no external credit data or identity.
- A user can start a new address to escape a default (no identity / sybil resistance).
- Portfolio points count vault deposits, which could include borrowed money re-deposited.
- Fixed weights and tiers; a real system would calibrate them on data and re-score over time.
- Unsecured exposure per loan is updated whenever the loan is touched, not continuously.
