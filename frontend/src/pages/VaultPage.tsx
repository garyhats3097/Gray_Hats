import { Link } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";
import { COLLATERAL_SYMBOL, contracts } from "../config/contracts";
import { useAccountState } from "../core/hooks/useAccountState";
import { useActivity } from "../core/hooks/useActivity";
import { PageHeader } from "../core/components/PageHeader";
import { AllocationDonut } from "../core/components/AllocationDonut";
import type { AllocationSegment } from "../core/components/AllocationBar";
import { VaultForm } from "../core/components/VaultForm";
import { FaucetButton } from "../core/components/FaucetButton";
import { ActivityTable } from "../core/components/ActivityTable";
import { Card, EmptyState, Skeleton, StatCard } from "../core/components/ui";
import { fmtAmount, fmtUsd, toNumber } from "../core/lib/format";

export default function VaultPage() {
  const s = useAccountState();
  const activity = useActivity();

  const segments: AllocationSegment[] = [
    { key: "free", label: "Available", value: s.free, color: "var(--color-free)" },
    { key: "perps", label: "Perpetuals", value: s.lockedPerps, color: "var(--color-perps)" },
    { key: "lending", label: "Lending", value: s.lockedLending, color: "var(--color-lending)" },
  ];
  const total = toNumber(s.deposits);

  return (
    <>
      <PageHeader
        title="Shared Vault"
        subtitle="Deposit collateral once. Modules lock what they need; the rest stays available."
        action={<FaucetButton />}
      />

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4 @3xl:gap-4">
        <StatCard tint="var(--color-marketmaker)" label="Wallet balance" value={fmtUsd(s.walletBalance)} sub="Not in the vault" loading={s.isLoading} />
        <StatCard tint="var(--color-accent)" label="Deposited" value={fmtUsd(s.deposits)} loading={s.isLoading} />
        <StatCard tint="var(--color-positive)" label="Available to withdraw" value={fmtUsd(s.free)} loading={s.isLoading} />
        <StatCard tint="var(--color-lending)" label="Locked by modules" value={fmtUsd(s.totalLocked)} loading={s.isLoading} />
      </div>

      <div className="mt-5 grid gap-5 @4xl:grid-cols-3">
        <div className="min-w-0 space-y-5 @4xl:col-span-2">
          <Card title="Where your collateral is" info="Each module can only lock collateral that is still available, so nothing is counted twice.">
            {s.isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <div className="grid items-center gap-6 sm:grid-cols-2">
                <AllocationDonut segments={segments} centerLabel="Deposited" centerValue={fmtUsd(s.deposits)} />
                <ul className="space-y-3">
                  {segments.map((seg) => (
                    <li key={seg.key} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2.5 text-sm">
                        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: seg.color }} />
                        {seg.label}
                        {seg.key !== "free" && seg.value > 0n && <Lock size={12} className="text-subtle" />}
                      </span>
                      <span className="tabular text-sm font-semibold">
                        {fmtUsd(seg.value)}
                        <span className="ml-1.5 text-xs font-normal text-subtle">
                          {total > 0 ? `${((toNumber(seg.value) / total) * 100).toFixed(1)}%` : "—"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title="Supported collateral" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead>
                  <tr className="border-y border-line text-xs text-subtle">
                    <th className="px-6 py-2.5 font-medium">Asset</th>
                    <th className="px-3 py-2.5 text-right font-medium">In wallet</th>
                    <th className="px-3 py-2.5 text-right font-medium">Deposited</th>
                    <th className="px-3 py-2.5 text-right font-medium">Available</th>
                    <th className="px-6 py-2.5 text-right font-medium">Locked</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2775ca] text-[11px] font-bold text-white">$</span>
                        <div>
                          <p className="font-medium">{COLLATERAL_SYMBOL}</p>
                          <p className="text-xs text-subtle">Mock USD Coin · test token</p>
                        </div>
                      </div>
                    </td>
                    <td className="tabular px-3 py-4 text-right font-medium">{fmtAmount(s.walletBalance)}</td>
                    <td className="tabular px-3 py-4 text-right font-medium">{fmtAmount(s.deposits)}</td>
                    <td className="tabular px-3 py-4 text-right font-medium">{fmtAmount(s.free)}</td>
                    <td className="tabular px-6 py-4 text-right font-medium">{fmtAmount(s.totalLocked)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-6 py-3 text-xs text-subtle">
              Prototype supports one collateral asset, valued at $1. Vault contract{" "}
              <span className="font-mono">{contracts.vault.address}</span>
            </p>
          </Card>
        </div>

        <Card title="Manage collateral" className="order-first h-fit @4xl:order-none">
          <VaultForm />
        </Card>
      </div>

      <Card
        title="Recent vault activity"
        className="mt-5"
        action={
          <Link to="/activity" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
            View all <ArrowRight size={14} />
          </Link>
        }
      >
        {activity.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !activity.data?.length ? (
          <EmptyState title="No vault transactions yet" body="Deposits, withdrawals and collateral locks will appear here." />
        ) : (
          <ActivityTable items={activity.data.slice(0, 6)} />
        )}
      </Card>
    </>
  );
}
