import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CandlestickChart, HandCoins, Plus } from "lucide-react";
import { useAccountState } from "../core/hooks/useAccountState";
import { useActivity } from "../core/hooks/useActivity";
import { useMarkPrice, useOpenPositions } from "../modules/perps/hooks";
import { PageHeader } from "../core/components/PageHeader";
import { AllocationBar, type AllocationSegment } from "../core/components/AllocationBar";
import { HealthGauge } from "../core/components/HealthGauge";
import { ActivityTable } from "../core/components/ActivityTable";
import { Modal } from "../core/components/Modal";
import { VaultForm } from "../core/components/VaultForm";
import { GetStarted } from "../core/components/GetStarted";
import { Badge, Button, Card, EmptyState, KeyValue, Skeleton, StatCard, cx } from "../core/components/ui";
import { fmtSignedUsd, fmtUsd, toNumber } from "../core/lib/format";

export default function PortfolioPage() {
  const s = useAccountState();
  const { positions } = useOpenPositions(s.positionIds);
  const { price } = useMarkPrice();
  const activity = useActivity();
  const [depositOpen, setDepositOpen] = useState(false);

  const segments: AllocationSegment[] = [
    { key: "free", label: "Available", value: s.free, color: "var(--color-free)" },
    { key: "perps", label: "Perpetuals margin", value: s.lockedPerps, color: "var(--color-perps)" },
    { key: "lending", label: "Lending collateral", value: s.lockedLending, color: "var(--color-lending)" },
  ];

  const isEmpty = s.loaded && s.deposits === 0n && s.debt === 0n;
  const pnl = s.unrealizedPnl;

  return (
    <>
      <PageHeader
        title="My Portfolio"
        subtitle="Your collateral, positions and loans across every module."
        action={
          <Button onClick={() => setDepositOpen(true)}>
            <Plus size={16} /> Deposit
          </Button>
        }
      />

      {isEmpty ? (
        <GetStarted walletBalance={s.walletBalance} onDeposit={() => setDepositOpen(true)} />
      ) : (
        <div className="space-y-5">
          {/* Headline numbers — parts of ONE deposit, never summed with PnL or debt */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatCard tint="var(--color-accent)" label="Total deposited" value={fmtUsd(s.deposits)} loading={s.isLoading} info="Everything you can claim from the shared vault, including locked collateral." />
            <StatCard tint="var(--color-positive)" label="Available" value={fmtUsd(s.free)} sub="Free to withdraw or use" loading={s.isLoading} info="Deposited collateral that no module has locked. Only this amount can be withdrawn." />
            <StatCard
              tint="var(--color-lending)"
              label="Locked"
              value={fmtUsd(s.totalLocked)}
              sub={`Perps ${fmtUsd(s.lockedPerps)} · Lending ${fmtUsd(s.lockedLending)}`}
              loading={s.isLoading}
              info="Collateral committed to open positions (Perpetuals) or backing loans (Lending)."
            />
            <StatCard
              label="Unrealized P&L"
              value={pnl === undefined ? "—" : fmtSignedUsd(pnl)}
              tone={pnl === undefined || pnl === 0n ? undefined : pnl > 0n ? "positive" : "negative"}
              sub="Not withdrawable until closed"
              loading={s.isLoading}
              info="Profit or loss on open perpetual positions at the current oracle price. It only becomes part of your deposit when you close the position."
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Your collateral" info="How your deposit is split. Locked collateral belongs to you but is committed to a module." className="lg:col-span-2">
              {s.isLoading ? <Skeleton className="h-24 w-full" /> : <AllocationBar segments={segments} total={s.deposits} />}
              <div className="mt-6 grid gap-x-8 border-t border-line pt-4 sm:grid-cols-2">
                <KeyValue label="Wallet balance (not deposited)" value={fmtUsd(s.walletBalance)} />
                <KeyValue label="Outstanding loan debt" value={fmtUsd(s.debt)} info="A liability, shown separately. Borrowed tokens are in your wallet, not in the vault." />
              </div>
            </Card>

            <Card
              title="Lending health"
              info="Health factor = lending collateral × your loan's liquidation threshold (85% by default, higher with good credit) ÷ debt. Below 1.0 the loan can be liquidated."
              action={
                <Link to="/lending" className="text-[13px] font-medium text-accent hover:underline">
                  Manage
                </Link>
              }
            >
              <HealthGauge hf={s.healthFactor} />
              <div className="mt-4 divide-y divide-line">
                <KeyValue label="Debt" value={fmtUsd(s.debt)} />
                <KeyValue label="Borrow capacity left" value={fmtUsd(s.borrowCapacity)} />
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card
              title="Open positions"
              action={
                <Link to="/perps" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                  Trade <ArrowRight size={14} />
                </Link>
              }
            >
              {positions.length === 0 ? (
                <EmptyState icon={<CandlestickChart size={18} />} title="No open positions" body="Open a long or short on ETH/USD from the Perpetuals module." />
              ) : (
                <ul className="divide-y divide-line">
                  {positions.slice(0, 4).map((p) => (
                    <li key={String(p.id)} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <Badge tone={p.isLong ? "positive" : "negative"}>{p.isLong ? "Long" : "Short"}</Badge>
                        <div>
                          <p className="text-sm font-medium">ETH/USD · {String(p.leverage)}x</p>
                          <p className="tabular text-xs text-subtle">
                            Size {fmtUsd(p.size)} · Entry {fmtUsd(p.entryPrice)}
                          </p>
                        </div>
                      </div>
                      <span className={cx("tabular text-sm font-semibold whitespace-nowrap", p.pnl !== undefined && toNumber(p.pnl) > 0 && "text-positive", p.pnl !== undefined && toNumber(p.pnl) < 0 && "text-negative")}>
                        {p.pnl === undefined ? "—" : fmtSignedUsd(p.pnl)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {price !== undefined && <p className="tabular mt-2 text-xs text-subtle">ETH/USD oracle price (mock): {fmtUsd(price)}</p>}
            </Card>

            <Card
              title="Loans"
              action={
                <Link to="/lending" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                  Borrow <ArrowRight size={14} />
                </Link>
              }
            >
              {s.debt === 0n && s.lendingCollateral === 0n ? (
                <EmptyState icon={<HandCoins size={18} />} title="No active loan" body="Allocate collateral to Lending to borrow against it: 75% by default, up to 120% with good credit." />
              ) : (
                <div className="divide-y divide-line">
                  <KeyValue label="Collateral in Lending" value={fmtUsd(s.lendingCollateral)} />
                  <KeyValue label="Outstanding debt" value={fmtUsd(s.debt)} />
                  <KeyValue label="Interest rate" value="5.00% APR (simple)" />
                  <KeyValue label="Borrow capacity left" value={fmtUsd(s.borrowCapacity)} />
                </div>
              )}
            </Card>
          </div>

          <Card
            title="Recent activity"
            action={
              <Link to="/activity" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                View all <ArrowRight size={14} />
              </Link>
            }
          >
            {activity.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !activity.data?.length ? (
              <EmptyState title="No transactions yet" />
            ) : (
              <ActivityTable items={activity.data.slice(0, 5)} compact />
            )}
          </Card>
        </div>
      )}

      <Modal open={depositOpen} onClose={() => setDepositOpen(false)} title="Shared Vault">
        <VaultForm onDone={() => setDepositOpen(false)} />
      </Modal>
    </>
  );
}
