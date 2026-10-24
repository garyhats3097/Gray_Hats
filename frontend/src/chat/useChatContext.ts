import { useAccount } from "wagmi";
import { useLocation } from "react-router-dom";
import { anvilLocal } from "../config/chain";
import { useAccountState } from "../core/hooks/useAccountState";
import { toNumber } from "../core/lib/format";
import { MODULES } from "../modules";
import { change24h, useEthHistory, useMarkPrice, useOpenPositions } from "../modules/perps/hooks";
import { TIERS, useCredit, useLendingMarket } from "../modules/lending/hooks";

const PAGE_NAMES: Record<string, string> = {
  "/": "Portfolio",
  "/vault": "Shared Vault",
  "/activity": "Activity",
  "/explorer": "Explorer",
  "/help": "Help & Setup",
};

const usd = (v: bigint | undefined) => (v === undefined ? null : Math.round(toNumber(v) * 100) / 100);
const pct = (bps: bigint | undefined) => (bps === undefined ? null : Number(bps) / 100);

/**
 * A plain summary of what the site knows right now — the page and the connected user's
 * on-chain state — sent with each question so the assistant can explain "my" numbers.
 * Mounted only while the chat is open.
 */
export function useChatContext() {
  const { pathname } = useLocation();
  const { isConnected, chainId } = useAccount();
  const s = useAccountState();
  const c = useCredit();
  const market = useLendingMarket();
  const { price, unavailable } = useMarkPrice();
  const history = useEthHistory();
  const { positions } = useOpenPositions(s.positionIds);

  const page = PAGE_NAMES[pathname] ?? MODULES.find((m) => pathname.startsWith(m.path))?.name ?? pathname;
  const change = change24h(history.data, price);
  const market_ = {
    ethPriceUsd: price === undefined ? (unavailable ? "unavailable (price feed stopped or chain offline)" : null) : usd(price),
    ethChange24hPct: change === undefined ? null : Math.round(change * 100) / 100,
  };

  if (!isConnected || !s.address) return { page, wallet: "not connected", market: market_ };

  const t = c.terms;
  return {
    page,
    wallet: s.address,
    network: chainId === anvilLocal.id ? "Anvil (local), correct" : `wrong network (chain ${chainId}); should be ${anvilLocal.id}`,
    chainReachable: s.loaded,
    market: market_,
    vault: {
      walletBalanceNotDeposited: usd(s.walletBalance),
      deposited: usd(s.deposits),
      freeAvailable: usd(s.free),
      lockedTotal: usd(s.totalLocked),
      lockedByPerps: usd(s.lockedPerps),
      lockedByLending: usd(s.lockedLending),
    },
    perps: {
      unrealizedPnl: usd(s.unrealizedPnl),
      openPositions: positions.map((p) => ({
        id: Number(p.id),
        side: p.isLong ? "long" : "short",
        size: usd(p.size),
        margin: usd(p.margin),
        leverage: Number(p.leverage),
        entryPrice: usd(p.entryPrice),
        pnl: usd(p.pnl),
        liquidationPrice: usd(p.liquidationPrice),
        liquidatable: p.liquidatable ?? null,
      })),
    },
    lending: {
      collateral: usd(s.lendingCollateral),
      debt: usd(s.debt),
      healthFactor: s.healthFactor === null ? "no debt" : Math.round(s.healthFactor * 1000) / 1000,
      borrowLimitTotal: usd(c.borrowLimit),
      canStillBorrow: usd(s.borrowCapacity),
      releasableCollateral: usd(c.maxRemovable),
      loanLiquidationThresholdPct: pct(c.loanThresholdBps),
      poolLiquidity: usd(market.poolLiquidity),
      aprPct: 5,
    },
    credit: t
      ? {
          score: Number(t.score),
          tier: TIERS[t.tier]?.name,
          maxLtvPct: pct(t.maxLtvBps),
          liquidationThresholdPct: pct(t.liquidationThresholdBps),
          unsecuredAllowance: usd(t.unsecuredAllowance),
          poolRoomForUnsecured: usd(c.poolUnsecuredRoom),
          defaulted: t.defaulted,
          points: c.breakdown && {
            loansRepaid: Number(c.breakdown.loansPoints),
            amountRepaid: Number(c.breakdown.volumePoints),
            accountAge: Number(c.breakdown.agePoints),
            vaultDeposit: Number(c.breakdown.portfolioPoints),
            perpsLiquidationPenalty: Number(c.breakdown.penaltyPoints),
          },
          history: c.record && {
            loansRepaid: Number(c.record.loansRepaid),
            totalRepaid: usd(c.record.repaidVolume),
            perpsLiquidations: Number(c.record.perpsLiquidations),
            lendingDefaults: Number(c.record.lendingDefaults),
            firstSeen: c.record.firstSeen > 0n ? new Date(Number(c.record.firstSeen) * 1000).toISOString() : "no loan or trade yet",
          },
        }
      : null,
  };
}

export type ChatContext = ReturnType<typeof useChatContext>;
