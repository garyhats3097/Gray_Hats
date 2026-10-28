import type { ReactNode } from "react";
import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { Badge, Card, KeyValue, Skeleton, cx } from "../../core/components/ui";
import { fmtUsd, toNumber } from "../../core/lib/format";
import { TIERS, useCredit } from "./hooks";

/** Tier bands get darker with a higher tier (one hue, light → dark). */
const BAND_COLORS = ["#dbe5fb", "#b3c7f7", "#6f95ee", "#1d4ed8"];

function ScoreBar({ score, tier }: { score: number; tier: number }) {
  const bands = TIERS.map((t, i) => ({ ...t, from: t.minScore, to: TIERS[i + 1]?.minScore ?? 100 }));
  return (
    <div>
      <div className="relative">
        <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
          {bands.map((b, i) => (
            <div key={b.id} className="h-full" style={{ width: `${b.to - b.from}%`, background: BAND_COLORS[i] }} title={`${b.name}: ${b.from}–${b.to}`} />
          ))}
        </div>
        <span
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink bg-surface"
          style={{ left: `${Math.min(Math.max(score, 0), 100)}%` }}
          aria-label={`Score ${score}`}
        />
      </div>
      {/* Legend instead of labels under the bar: the top bands are too narrow for their names. */}
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        {bands.map((b, i) => (
          <li key={b.id} className={cx("flex min-w-0 items-center gap-1.5", i === tier ? "font-semibold text-ink" : "text-subtle")}>
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: BAND_COLORS[i] }} />
            <span className="truncate">{b.name}</span>
            <span className="tabular ml-auto shrink-0">
              {b.from}+ · {b.ltvPct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, detail, points, max, negative }: { label: string; detail: string; points: number; max?: number; negative?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-[13px]">
      <div>
        <p className="text-ink">{label}</p>
        <p className="text-xs text-subtle">{detail}</p>
      </div>
      <span className={cx("tabular shrink-0 font-semibold", negative && points > 0 && "text-negative")}>
        {negative ? (points > 0 ? `−${points}` : "0") : `${points}${max !== undefined ? ` / ${max}` : ""}`}
      </span>
    </div>
  );
}

function Eligibility({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-0.5 leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}

/**
 * The user's on-chain credit score and what it unlocks. Everything comes from the
 * CreditRegistry contract; the page only explains it.
 */
export function CreditProfile() {
  const c = useCredit();
  const t = c.terms;
  const b = c.breakdown;
  const r = c.record;

  if (c.isLoading || !t || !b || !r) {
    return (
      <Card title="Credit profile">
        <Skeleton className="h-48 w-full" />
      </Card>
    );
  }

  const score = Number(t.score);
  const tier = TIERS[t.tier];
  const next = TIERS[t.tier + 1];
  const prime = TIERS[3];
  const eligible = !t.defaulted && t.tier === 3 && t.unsecuredAllowance > 0n;
  const ageHours = r.firstSeen > 0n ? Math.floor((Date.now() / 1000 - Number(r.firstSeen)) / 3600) : 0;

  return (
    <Card
      title="Credit profile"
      info="Your score comes from your real on-chain history in this protocol. It decides how much you can borrow — the best tier can borrow more than its collateral."
      action={
        <Badge tone={t.defaulted ? "negative" : t.tier >= 2 ? "positive" : t.tier === 1 ? "accent" : "neutral"}>{t.defaulted ? "Defaulted" : tier.name}</Badge>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="flex items-end gap-1.5">
            <span className="tabular text-4xl font-semibold tracking-tight">{score}</span>
            <span className="mb-1 text-sm text-muted">/ 100</span>
          </div>
          <div className="mt-4">
            <ScoreBar score={score} tier={t.defaulted ? -1 : t.tier} />
          </div>

          <div className="mt-5 rounded-xl bg-sunken/70 px-3.5 py-3 text-[13px]">
            {t.defaulted ? (
              <Eligibility icon={<ShieldAlert size={16} className="text-negative" />} title="Not eligible for undercollateralized loans">
                A lending loan was liquidated, so your score is 0 for good. You can still borrow up to 75% of your collateral.
              </Eligibility>
            ) : eligible ? (
              <Eligibility icon={<CheckCircle2 size={16} className="text-positive" />} title="Eligible for undercollateralized loans">
                Borrow up to {prime.ltvPct}% of your collateral, at most <b className="text-ink">{fmtUsd(t.unsecuredAllowance)}</b> above it.
              </Eligibility>
            ) : (
              <Eligibility icon={<XCircle size={16} className="text-subtle" />} title="Not yet eligible for undercollateralized loans">
                <b className="text-ink">{Math.max(prime.minScore - score, 0)} more points</b> to reach Prime ({prime.minScore}).
                {next && next.id !== 3 && (
                  <>
                    {" "}
                    Next up: {next.name} at {next.minScore}, borrow up to {next.ltvPct}%.
                  </>
                )}
              </Eligibility>
            )}
          </div>

          <div className="mt-4 divide-y divide-line border-t border-line">
            <KeyValue label="Your max loan-to-value" value={`${Number(t.maxLtvBps) / 100}%`} />
            <KeyValue label="Liquidation threshold (new loans)" value={`${Number(t.liquidationThresholdBps) / 100}%`} />
            <KeyValue
              label="Unsecured allowance"
              value={fmtUsd(t.unsecuredAllowance)}
              info="The most you can owe above your collateral: 25% of everything you have repaid. Only for the Prime tier."
            />
            <KeyValue
              label="Pool room for unsecured loans"
              value={c.poolUnsecuredRoom === undefined ? "—" : fmtUsd(c.poolUnsecuredRoom)}
              info="All unsecured debt together may use at most 10% of the lending pool."
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-[13px] font-medium text-muted">How your score is built</p>
          <div className="divide-y divide-line">
            <Row
              label="Loans repaid in full"
              detail={`${r.loansRepaid} loan${r.loansRepaid === 1 ? "" : "s"} · +10 each`}
              points={Number(b.loansPoints)}
              max={30}
            />
            <Row label="Total amount repaid" detail={`${fmtUsd(r.repaidVolume)} · +1 per $100`} points={Number(b.volumePoints)} max={30} />
            <Row
              label="Account age"
              detail={r.firstSeen > 0n ? `${ageHours} hour${ageHours === 1 ? "" : "s"} · +1 per hour` : "Starts at your first loan or trade"}
              points={Number(b.agePoints)}
              max={10}
            />
            <Row label="Vault deposit (portfolio)" detail={`+1 per $500 deposited`} points={Number(b.portfolioPoints)} max={30} />
            <Row label="Perpetuals liquidations" detail={`${r.perpsLiquidations} · −10 each`} points={Number(b.penaltyPoints)} negative />
          </div>
          <p className="mt-3 text-xs text-subtle">
            Any lending liquidation sets the score to 0 permanently. Scores come only from on-chain activity in this protocol; history before your first loan or
            trade isn't counted.
          </p>
          {toNumber(c.totalBadDebt) > 0 && (
            <p className="mt-2 text-xs text-subtle">Protocol bad debt from defaulted unsecured loans: {fmtUsd(c.totalBadDebt)}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
