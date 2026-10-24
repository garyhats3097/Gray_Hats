import { AlertTriangle, HandCoins, History, Info } from "lucide-react";
import { useAccountState } from "../../core/hooks/useAccountState";
import { useActivity } from "../../core/hooks/useActivity";
import { PageHeader } from "../../core/components/PageHeader";
import { HealthGauge } from "../../core/components/HealthGauge";
import { ActivityTable } from "../../core/components/ActivityTable";
import { Callout, Card, EmptyState, KeyValue, Skeleton, StatCard } from "../../core/components/ui";
import { Link } from "react-router-dom";
import { fmtUsd, toNumber } from "../../core/lib/format";
import { APR_PCT, useCredit, useLendingMarket } from "./hooks";
import { LendingPanel } from "./LendingPanel";
import { CreditProfile } from "./CreditProfile";

/** Debt as a share of collateral, against the tier's borrow limit and the loan's liquidation line. */
function UsageBar({ collateral, debt, limitPct, liqPct }: { collateral: bigint; debt: bigint; limitPct: number; liqPct: number }) {
  const c = toNumber(collateral);
  const d = toNumber(debt);
  const usedPct = c > 0 ? (d / c) * 100 : 0;
  // Scale so the liquidation line (which can be above 100%) always fits.
  const scale = Math.max(100, liqPct * 1.08, usedPct * 1.05);
  const at = (p: number) => `${Math.min((p / scale) * 100, 100)}%`;
  const usedTone = usedPct > liqPct ? "var(--color-negative)" : usedPct > limitPct * 0.9 ? "var(--color-warning-mark)" : "var(--color-lending)";
  return (
    <div>
      <div className="relative h-3 w-full rounded-full bg-sunken">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: at(usedPct), background: usedTone, minWidth: d > 0 ? 4 : 0 }} />
        {scale > 100 && <span className="absolute top-[-4px] h-5 w-[2px] bg-line-strong" style={{ left: at(100) }} title="100% = your collateral" />}
        <span className="absolute top-[-4px] h-5 w-[2px] bg-ink/60" style={{ left: at(limitPct) }} title={`Borrow limit (${limitPct}%)`} />
        <span className="absolute top-[-4px] h-5 w-[2px] bg-negative" style={{ left: at(liqPct) }} title={`Liquidation threshold (${liqPct}%)`} />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-[2px] bg-ink/60" /> Borrow limit {limitPct}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-[2px] bg-negative" /> Liquidation {liqPct}%
        </span>
        {scale > 100 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-[2px] bg-line-strong" /> 100% = collateral
          </span>
        )}
      </div>
      <p className="tabular mt-2 text-[13px] text-muted">
        Debt is <b className="text-ink">{c > 0 ? ((d / c) * 100).toFixed(1) : "0.0"}%</b> of your lending collateral.
      </p>
    </div>
  );
}

export default function LendingPage() {
  const s = useAccountState();
  const { poolLiquidity } = useLendingMarket();
  const credit = useCredit();
  const limitPct = credit.terms ? Number(credit.terms.maxLtvBps) / 100 : 75;
  const liqPct = credit.loanThresholdBps !== undefined ? Number(credit.loanThresholdBps) / 100 : 85;
  const activity = useActivity();
  const history = (activity.data ?? []).filter((i) => i.module === "Lending");
  const yearlyInterest = (toNumber(s.debt) * APR_PCT) / 100;

  return (
    <>
      <PageHeader
        title="Lending"
        subtitle="Borrow against collateral from the shared vault. Your on-chain credit tier sets the limit: 75% of collateral for new users (Standard), up to 120% — more than your collateral — at Prime."
      />

      {s.healthFactor !== null && s.healthFactor < 1.25 && (
        <div className="mb-5">
          <Callout tone={s.healthFactor < 1 ? "negative" : "warning"} icon={<AlertTriangle size={14} className={s.healthFactor < 1 ? "text-negative" : "text-warning"} />}>
            {s.healthFactor < 1 ? (
              <><b>Your loan can be liquidated now.</b> Anyone can repay it using your lending collateral plus a 5% penalty. Repay debt or allocate more collateral.</>
            ) : (
              <><b>Your loan is close to liquidation.</b> Interest keeps increasing the debt. Repay some debt or allocate more collateral.</>
            )}
          </Callout>
        </div>
      )}

      {s.loanReadFailed && (
        <div className="mb-5">
          <Callout tone="negative" icon={<AlertTriangle size={14} className="text-negative" />}>
            <b>Couldn't read your loan from the chain</b>, so the numbers below may show $0. This happens when a local chain that was
            time-travelled is restarted with an older version of the start script. Stop the chain (Ctrl+C), run{" "}
            <code className="rounded bg-surface px-1">git pull</code>, then start it again with{" "}
            <code className="rounded bg-surface px-1">./scripts/start-chain.sh</code>. Your data is not lost.
          </Callout>
        </div>
      )}
      {s.loaded && s.deposits === 0n && (
        <div className="mb-5">
          <Callout tone="accent" icon={<Info size={14} className="text-accent" />}>
            You haven't deposited anything yet. Lending uses collateral from the shared vault: first{" "}
            <Link to="/vault" className="font-medium text-accent underline-offset-2 hover:underline">
              deposit mUSDC in the Shared Vault
            </Link>
            , then come back and <b>Allocate</b> it here.
          </Callout>
        </div>
      )}
      {s.loaded && s.free > 0n && s.lendingCollateral === 0n && (
        <div className="mb-5">
          <Callout tone="accent" icon={<Info size={14} className="text-accent" />}>
            You have <b>{fmtUsd(s.free)}</b> available in the shared vault. A vault deposit is not Lending collateral yet: use{" "}
            <b>Allocate</b> in "Manage loan" to move it into Lending, then you can borrow against it.
          </Callout>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard tint="var(--color-lending)" label="Collateral in Lending" value={fmtUsd(s.lendingCollateral)} loading={s.isLoading} info="Collateral locked in the shared vault for the Lending module. It cannot be used by Perpetuals at the same time." />
        <StatCard tint="var(--color-negative)" label="Outstanding debt" value={fmtUsd(s.debt)} sub={s.debt > 0n ? "Includes accrued interest" : undefined} loading={s.isLoading} />
        <StatCard tint="var(--color-positive)" label="Borrow capacity left" value={fmtUsd(s.borrowCapacity)} loading={s.isLoading} info="Your credit tier's limit on your lending collateral (including any unsecured allowance), minus what you already owe." />
        <StatCard tint="var(--color-accent)" label="Pool liquidity" value={poolLiquidity === undefined ? "—" : fmtUsd(poolLiquidity)} sub="Test funds from deploy" info="mUSDC available to borrow. Seeded by the deploy script; repayments and interest flow back into it." />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <CreditProfile />
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Health factor" info="Lending collateral × your loan's liquidation threshold ÷ debt. Below 1.0 anyone can liquidate the loan.">
              {s.isLoading ? <Skeleton className="h-36 w-full" /> : <HealthGauge hf={s.healthFactor} />}
              <div className="mt-4 divide-y divide-line">
                <KeyValue label="Liquidation when debt reaches" value={s.lendingCollateral > 0n ? fmtUsd((toNumber(s.lendingCollateral) * liqPct) / 100) : "—"} />
                <KeyValue label="Interest per year at 5% APR" value={fmtUsd(yearlyInterest)} />
              </div>
            </Card>
            <Card title="Loan usage">
              {s.lendingCollateral === 0n ? (
                <EmptyState icon={<HandCoins size={18} />} title="No collateral allocated" body="Allocate collateral from the vault to start borrowing." />
              ) : (
                <UsageBar collateral={s.lendingCollateral} debt={s.debt} limitPct={limitPct} liqPct={liqPct} />
              )}
              <div className="mt-4 divide-y divide-line border-t border-line pt-1">
                <KeyValue label="Max loan-to-value (your tier)" value={`${limitPct}%`} />
                <KeyValue label="Liquidation threshold" value={`${liqPct}%`} info="Fixed per loan: the tier you borrowed under. A later score change doesn't change it." />
                <KeyValue label="Liquidation penalty" value="5% of debt" info="On liquidation, debt + 5% is taken from your lending collateral into the pool. The rest is released back to you." />
              </div>
            </Card>
          </div>

          <Card title="Loan history">
            {history.length === 0 ? (
              <EmptyState icon={<History size={18} />} title="No lending activity yet" />
            ) : (
              <ActivityTable items={history} compact />
            )}
          </Card>
        </div>

        <Card title="Manage loan" className="order-first h-fit lg:order-none">
          <LendingPanel />
        </Card>
      </div>
    </>
  );
}
