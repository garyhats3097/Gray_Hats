import { useState } from "react";
import { CandlestickChart, History } from "lucide-react";
import { useAccountState } from "../../core/hooks/useAccountState";
import { useActivity } from "../../core/hooks/useActivity";
import { PageHeader } from "../../core/components/PageHeader";
import { ActivityTable } from "../../core/components/ActivityTable";
import { Card, EmptyState, Spinner, Stat, Tabs, cx } from "../../core/components/ui";
import { fmtSignedUsd, fmtUsd } from "../../core/lib/format";
import { change24h, useEthHistory, useMarkPrice, useOpenPositions, usePerpsPool } from "./hooks";
import { PriceChart } from "./PriceChart";
import { TradePanel } from "./TradePanel";
import { PositionsTable } from "./PositionsTable";

export default function PerpsPage() {
  const s = useAccountState();
  const { price } = useMarkPrice();
  const pool = usePerpsPool();
  const history = useEthHistory();
  const { positions, isLoading } = useOpenPositions(s.positionIds);
  const activity = useActivity();
  const [tab, setTab] = useState<"open" | "closed">("open");

  const change = change24h(history.data, price);
  const closed = (activity.data ?? []).filter((i) => i.module === "Perpetuals" && (i.type === "Position closed" || i.type === "Position liquidated"));
  const realized = closed.reduce((sum, i) => sum + (i.signed ?? 0n), 0n);

  return (
    <>
      <PageHeader
        title="Perpetuals"
        subtitle="Trade ETH/USD with leverage at the real market price. Margin is locked in the shared vault while a position is open."
      />

      <Card padded={false} className="mb-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:p-6 md:grid-cols-5">
          <div className="col-span-2 flex items-center gap-3 md:col-span-1">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#627eea] text-sm font-bold text-white">Ξ</span>
            <div>
              <p className="font-semibold">ETH/USD</p>
              <p className="text-xs text-subtle">Perpetual · real market price</p>
            </div>
          </div>
          <Stat label="Mark price" value={price === undefined ? "—" : fmtUsd(price)} info="The on-chain oracle price, updated every 15 seconds from the real ETH market (Coinbase, Kraken or CoinGecko)." />
          <Stat
            label="24h change"
            value={change === undefined ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
            tone={change === undefined || change === 0 ? undefined : change > 0 ? "positive" : "negative"}
          />
          <Stat label="Pool liquidity" value={pool === undefined ? "—" : fmtUsd(pool)} info="The perps pool pays trader profits and receives losses and fees. Seeded by the deploy script (test funds)." />
          <Stat label="Your available" value={fmtUsd(s.free)} info="Free collateral in the shared vault that can be used as margin." />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Price" info="Real ETH/USD market history, followed by the live on-chain oracle price that the contracts use." className="lg:col-span-2">
          <PriceChart positions={positions} />
        </Card>
        <Card title="Trade" className="h-fit lg:row-span-2">
          <TradePanel />
        </Card>
        <Card
          padded={false}
          className="lg:col-span-2"
          title={<Tabs value={tab} onChange={setTab} options={[{ value: "open", label: `Open (${positions.length})` }, { value: "closed", label: "History" }]} />}
          action={
            tab === "open" && s.unrealizedPnl !== undefined && positions.length > 0 ? (
              <span className="text-right text-[13px] text-muted">
                Unrealized{" "}
                <b className={cx("tabular", s.unrealizedPnl > 0n && "text-positive", s.unrealizedPnl < 0n && "text-negative")}>{fmtSignedUsd(s.unrealizedPnl)}</b>
              </span>
            ) : tab === "closed" && closed.length > 0 ? (
              <span className="text-right text-[13px] text-muted">
                Realized net <b className={cx("tabular", realized > 0n && "text-positive", realized < 0n && "text-negative")}>{fmtSignedUsd(realized)}</b>
              </span>
            ) : null
          }
        >
          <div key={tab} className="animate-fade">
            {tab === "open" ? (
              isLoading ? (
                <Spinner />
              ) : positions.length === 0 ? (
                <EmptyState icon={<CandlestickChart size={18} />} title="No open positions" body="Use the trade panel to open a long or short." />
              ) : (
                <PositionsTable positions={positions} price={price} />
              )
            ) : closed.length === 0 ? (
              <EmptyState icon={<History size={18} />} title="No closed positions yet" body="Realized profit and loss appears here after you close a position." />
            ) : (
              <div className="px-5 pb-2 sm:px-6">
                <ActivityTable items={closed} compact />
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
