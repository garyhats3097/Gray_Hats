# Accounting model

One collateral token (**mUSDC**, 18 decimals, valued at $1). Everything below is enforced
by `contracts/src/core/CoreVault.sol`.

## State
| Variable | Meaning |
|---|---|
| `deposits[user]` | What the user can claim from the vault |
| `lockedBy[user][module]` | Part of that deposit committed to one module |
| `totalLocked[user]` | Sum of the user's locks |
| `moduleReserve[module]` | Protocol liquidity owned by a module (perps pool, lending pool) |
| `freeCollateral(user)` | `deposits - totalLocked`: the only withdrawable amount |

## Invariants
| # | Rule | Tested in |
|---|---|---|
| I1 | `balanceOf(vault) >= totalDeposits + totalReserves` | invariant test |
| I2 | `totalLocked[user] <= deposits[user]` | invariant + fuzz |
| I3 | Only module M changes `lockedBy[*][M]`; only registered modules call module functions | unit |
| I4 | `withdraw(x)` requires `x <= freeCollateral` | unit |
| I5 | A loss realised by M comes only from `lockedBy[user][M]` | unit + integration |
| I6 | A profit paid by M comes only from `moduleReserve[M]` | unit |

## Vault primitives used by modules
| Function | Effect |
|---|---|
| `lock(user, x)` | free → locked (active modules only) |
| `unlock(user, x)` | locked → free |
| `realizeLoss(user, x)` | locked → module reserve (deposit shrinks) |
| `realizeProfit(user, x)` | module reserve → user's free deposit |
| `payFromReserve(to, x)` | module reserve → tokens sent to a wallet (loan payout) |
| `creditReserve(x)` | tokens already in the vault → module reserve (loan repayment) |

A disabled module can still `unlock`/settle (wind-down) but can never `lock` new collateral.

## Display rules for the frontend
- **Available** = `freeCollateral`. Unrealised PnL is shown separately and is never withdrawable.
- Lending **debt** is a liability shown on its own. It is not subtracted from deposits,
  because the borrowed tokens are in the user's wallet.
- Never add locked + free + PnL + debt into one "net worth" number.

## Module rules
**Perps:** isolated margin; `margin = size / leverage`; max 10x; 0.1% fee on open and on close;
liquidation when `margin + PnL <= 5% of size` (whole margin goes to the pool); profit capped
at pool liquidity (`ProfitCapped` event); loss capped at the position's margin (`BadDebt` event).
No funding rate.

**Lending:** borrow up to 75% of collateral allocated to Lending; 5% simple APR; health factor
= `collateral × 85% / debt`; below 1.0 anyone can liquidate (debt + 5% penalty seized).
Borrowed tokens come from a pool seeded by the deploy script, not from real lenders.
