import { useState } from "react";
import { AlertTriangle, ArrowLeftRight, Camera, Info, Pause, Play, Settings2 } from "lucide-react";
import { useAccount } from "wagmi";
import { contracts, ETH_USD, COLLATERAL_SYMBOL } from "../../config/contracts";
import { useTx } from "../../core/hooks/useTx";
import { PageHeader } from "../../core/components/PageHeader";
import { Badge, Button, Callout, Card, EmptyState, KeyValue, Spinner, Stat, cx, Ticker } from "../../core/components/ui";
import { labelFor } from "../../core/lib/explorer";
import { fmtTime, fmtUsd, parseAmount, shortAddress } from "../../core/lib/format";
import { QUOTE_STATUS, useMarketMaker, useMarketMakerHistory, type MMEvent } from "./hooks";

const pct = (bps: bigint | number) => `${(Number(bps) / 100).toFixed(2)}%`;

function StatusBadge({ status }: { status?: number }) {
  if (status === QUOTE_STATUS.OK) return <Badge tone="positive">● Quoting live</Badge>;
  if (status === QUOTE_STATUS.PAUSED) return <Badge tone="warning">Paused</Badge>;
  if (status === QUOTE_STATUS.ORACLE_UNAVAILABLE) return <Badge tone="negative">Oracle unavailable</Badge>;
  if (status === QUOTE_STATUS.NOT_LISTED) return <Badge tone="negative">Market not listed</Badge>;
  return <Badge>—</Badge>;
}

function describe(e: MMEvent, me?: string): string {
  const a = e.args;
  const by = labelFor(a.by as string, me) ?? shortAddress(a.by as string);
  switch (e.name) {
    case "OwnershipTransferred":
      return `Module deployed (owner: ${labelFor(a.newOwner as string, me) ?? shortAddress(a.newOwner as string)})`;
    case "MarketListed":
      return `Market listed: ${a.symbol}, spread ${a.spreadBps} bps, size ${fmtUsd(a.maxQuoteSize as bigint)}`;
    case "OperatorSet":
      return `${a.allowed ? "Operator added" : "Operator removed"}: ${labelFor(a.operator as string, me) ?? shortAddress(a.operator as string)}`;
    case "SpreadUpdated":
      return `Spread ${a.oldSpreadBps} → ${a.newSpreadBps} bps (by ${by})`;
    case "MaxQuoteSizeUpdated":
      return `Quote size ${fmtUsd(a.oldSize as bigint)} → ${fmtUsd(a.newSize as bigint)} (by ${by})`;
    case "QuotingStatusChanged":
      return `Quoting ${a.enabled ? "resumed" : "paused"} (by ${by})`;
    case "QuotePublished":
      return `Quote published: bid ${fmtUsd(a.bid as bigint)} / ask ${fmtUsd(a.ask as bigint)} at mid ${fmtUsd(a.mid as bigint)} (by ${by})`;
    default:
      return e.name;
  }
}

function Settings({ mm }: { mm: ReturnType<typeof useMarketMaker> }) {
  const { send, busy } = useTx();
  const [spread, setSpread] = useState("");
  const [size, setSize] = useState("");
  const min = Number(mm.minSpread ?? 5n);
  const max = Number(mm.maxSpread ?? 1000n);

  const spreadNum = spread === "" ? null : Number(spread);
  const spreadError =
    spread !== "" && (!Number.isInteger(spreadNum) || spreadNum! < min || spreadNum! > max) ? `Whole number between ${min} and ${max} bps` : null;
  const sizeValue = parseAmount(size);
  const sizeError = size !== "" && sizeValue === null ? "Enter a valid amount" : null;

  if (!mm.canConfigure) {
    return (
      <Callout icon={<Info size={14} />}>
        Only authorised operators can change Market Maker settings. The deploy script authorises test account #1 (0x7099…79C8) and the
        admin.
      </Callout>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-muted">Spread (basis points, 100 bps = 1%)</label>
        <div className="flex gap-2">
          <input
            inputMode="numeric"
            value={spread}
            placeholder={mm.spreadBps !== undefined ? `${mm.spreadBps} (current)` : ""}
            onChange={(e) => /^\d{0,4}$/.test(e.target.value) && setSpread(e.target.value)}
            className={cx("tabular h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none focus:border-accent", spreadError ? "border-negative/60" : "border-line-strong")}
          />
          <Button
            variant="secondary"
            disabled={spreadNum === null || !!spreadError || busy}
            onClick={async () => {
              if (await send(`Set spread to ${spreadNum} bps`, "Market Maker", { ...contracts.marketMaker, functionName: "setSpread", args: [ETH_USD, BigInt(spreadNum!)] }))
                setSpread("");
            }}
          >
            Save
          </Button>
        </div>
        <p className={cx("mt-1 text-xs", spreadError ? "text-negative" : "text-subtle")}>
          {spreadError ?? `Allowed: ${min}–${max} bps (${pct(min)}–${pct(max)}). Enforced by the contract too.`}
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-muted">Indicative quote size per side (USD)</label>
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            value={size}
            placeholder={mm.maxQuoteSize !== undefined ? `${fmtUsd(mm.maxQuoteSize)} (current)` : ""}
            onChange={(e) => /^\d*\.?\d{0,18}$/.test(e.target.value) && setSize(e.target.value)}
            className={cx("tabular h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none focus:border-accent", sizeError ? "border-negative/60" : "border-line-strong")}
          />
          <Button
            variant="secondary"
            disabled={sizeValue === null || busy}
            onClick={async () => {
              if (await send(`Set quote size to ${fmtUsd(sizeValue!)}`, "Market Maker", { ...contracts.marketMaker, functionName: "setMaxQuoteSize", args: [ETH_USD, sizeValue!] }))
                setSize("");
            }}
          >
            Save
          </Button>
        </div>
        {sizeError && <p className="mt-1 text-xs text-negative">{sizeError}</p>}
      </div>

      <div className="grid gap-2">
        {mm.quotingEnabled ? (
          <Button variant="secondary" loading={busy} onClick={() => send("Pause quoting", "Market Maker", { ...contracts.marketMaker, functionName: "setQuotingEnabled", args: [false] })}>
            <Pause size={15} /> Pause quoting
          </Button>
        ) : (
          <Button variant="accent" loading={busy} onClick={() => send("Resume quoting", "Market Maker", { ...contracts.marketMaker, functionName: "setQuotingEnabled", args: [true] })}>
            <Play size={15} /> Resume quoting
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={mm.status !== QUOTE_STATUS.OK || busy}
          onClick={() => send("Publish quote snapshot", "Market Maker", { ...contracts.marketMaker, functionName: "publishQuote", args: [ETH_USD] })}
        >
          <Camera size={15} /> Publish quote snapshot
        </Button>
      </div>
      <p className="text-xs text-subtle">A snapshot records the current quote on-chain so it appears in the history below.</p>
    </div>
  );
}

export default function MarketMakerPage() {
  const { address } = useAccount();
  const mm = useMarketMaker();
  const history = useMarketMakerHistory(mm.deployed);

  const header = <PageHeader title="Market Maker" subtitle="Indicative bid/ask quotes around the shared oracle price. Quote-only prototype stub." />;

  if (mm.isLoading) return (<>{header}<Spinner /></>);
  if (!mm.deployed) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={<ArrowLeftRight size={20} />}
            title="The Market Maker module isn't on this chain yet"
            body="Restart the chain with ./scripts/start-chain.sh (after git pull). It adds the module to your saved chain without touching your existing data."
          />
        </Card>
      </>
    );
  }

  const q = mm.quote;
  return (
    <>
      {header}

      {mm.status === QUOTE_STATUS.PAUSED && (
        <div className="mb-5">
          <Callout tone="warning" icon={<Pause size={14} className="text-warning" />}>
            <b>Quoting is paused</b> by an operator. No bid or ask is offered until it is resumed.
          </Callout>
        </div>
      )}
      {mm.status === QUOTE_STATUS.ORACLE_UNAVAILABLE && (
        <div className="mb-5">
          <Callout tone="negative" icon={<AlertTriangle size={14} className="text-negative" />}>
            <b>No valid oracle price</b> (missing or out of date), so the module has stopped quoting automatically. It resumes as soon as the
            oracle has a fresh price.
          </Callout>
        </div>
      )}

      {/* Market overview */}
      <Card padded={false} className="mb-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:p-6 md:grid-cols-4">
          <div className="col-span-2 flex items-center gap-3 md:col-span-1">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#627eea] text-sm font-bold text-white">Ξ</span>
            <div>
              <p className="font-semibold">ETH/USD</p>
              <p className="text-xs text-subtle">Reference: shared oracle</p>
            </div>
          </div>
          <Stat
            label="Reference price"
            value={mm.referencePrice === undefined ? "—" : fmtUsd(mm.referencePrice)}
            sub={mm.priceUpdatedAt ? `Updated ${fmtTime(mm.priceUpdatedAt)} (chain time)` : undefined}
            info="The same on-chain oracle price Perpetuals uses, updated every 15 seconds from the real ETH market."
          />
          <Stat label="Spread" value={mm.spreadBps === undefined ? "—" : `${mm.spreadBps} bps`} sub={mm.spreadBps === undefined ? undefined : pct(mm.spreadBps)} />
          <div>
            <p className="text-[13px] text-muted">Module status</p>
            <div className="mt-2">
              <StatusBadge status={mm.status} />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        {/* Live quotes */}
        <Card
          title="Live quotes"
          className="lg:col-span-2"
          info="Bid = price the module would buy ETH at. Ask = price it would sell at. Both sit half the spread away from the reference price."
          action={<Badge tone="warning">Indicative — not executable</Badge>}
        >
          {!q ? (
            <EmptyState title="No quote available" body="See the status message above." />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Bid (we buy ETH)", value: q.bid, emphasis: true },
                  { label: "Mid (oracle)", value: q.mid, emphasis: false },
                  { label: "Ask (we sell ETH)", value: q.ask, emphasis: true },
                ].map((x) => (
                  <div
                    key={x.label}
                    className={cx(
                      "rounded-xl border p-3 transition-[box-shadow,transform,border-color] duration-200 sm:p-4",
                      x.emphasis ? "border-line-strong bg-surface hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]" : "border-dashed border-line bg-sunken/40",
                    )}
                  >
                    <p className="text-xs text-muted">{x.label}</p>
                    <p className="display mt-1 text-xl font-medium sm:text-[28px]">
                      <Ticker value={fmtUsd(x.value)} />
                    </p>
                  </div>
                ))}
              </div>
              {/* bid–mid–ask band */}
              <div className="mt-5">
                <div className="relative h-2 rounded-full bg-sunken">
                  <div className="absolute inset-y-0 left-[15%] right-[15%] rounded-full bg-accent/25" />
                  {[15, 50, 85].map((left) => (
                    <span key={left} className={cx("absolute top-1/2 h-4 w-[3px] -translate-y-1/2 rounded", left === 50 ? "bg-muted" : "bg-accent")} style={{ left: `${left}%` }} />
                  ))}
                </div>
                <div className="tabular mt-2 flex justify-between text-xs text-muted">
                  <span className="pl-[12%]">Bid</span>
                  <span>Spread {fmtUsd(q.ask - q.bid)} ({pct(q.spreadBps)})</span>
                  <span className="pr-[12%]">Ask</span>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Settings */}
        <Card title="Spread settings" className="h-fit lg:row-span-2" action={<Settings2 size={16} className="text-subtle" />}>
          <Settings mm={mm} />
        </Card>

        {/* Liquidity */}
        <Card
          title="Liquidity & inventory"
          className="lg:col-span-2"
          info="Liquidity is this module's reserve inside the shared CoreVault — no separate vault. It locks no user collateral."
        >
          <div className="divide-y divide-line">
            <KeyValue label="Supported asset" value={`${COLLATERAL_SYMBOL} (USD side only)`} />
            <KeyValue label="Funded liquidity (vault reserve)" value={mm.funded === undefined ? "—" : fmtUsd(mm.funded)} />
            <KeyValue
              label="Bid side — executable / indicative"
              value={mm.bidSide === undefined ? "—" : `${fmtUsd(mm.bidSide)} / ${fmtUsd(mm.indicativeSize)}`}
            />
            <KeyValue label="Ask side — executable" value={mm.askSide === undefined ? "—" : `${fmtUsd(mm.askSide)} (no ETH inventory)`} />
          </div>
          <div className="mt-4">
            <Callout icon={<Info size={14} />}>
              <b>Quotes are indicative.</b> A quote is only executable up to funded liquidity. This stub has no funded liquidity by default, and
              the vault holds only {COLLATERAL_SYMBOL} — no ETH — so the ask side has no inventory. Funded trading and liquidity provision are
              future work.
            </Callout>
          </div>
        </Card>

        {/* History */}
        <Card title="Activity history" className="lg:col-span-3" padded={false}>
          {history.isLoading ? (
            <Spinner />
          ) : !history.data?.length ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="divide-y divide-line px-5 pb-2 sm:px-6">
              {history.data.map((e) => (
                <li key={`${e.hash}-${e.name}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-[13px] text-ink">{describe(e, address)}</span>
                  <span className="tabular shrink-0 text-xs text-subtle">
                    {fmtTime(e.timestamp)} · block #{String(e.blockNumber)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
