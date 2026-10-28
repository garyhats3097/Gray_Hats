import { useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { Blocks, CheckCircle2, Search, ShieldAlert, ShieldCheck, Users, XCircle } from "lucide-react";
import { useAllUsers, useProtocolState, useRecentChain, type ExplorerTx } from "../core/hooks/useExplorer";
import { CONTRACT_DIRECTORY, decodeCall, decodeLogs, isContract, labelFor } from "../core/lib/explorer";
import { PageHeader } from "../core/components/PageHeader";
import { LiquidationsCard } from "../core/components/LiquidationsCard";
import { AllocationBar } from "../core/components/AllocationBar";
import { fmtHealth } from "../core/components/HealthGauge";
import { Modal } from "../core/components/Modal";
import { Badge, Card, EmptyState, KeyValue, Skeleton, Spinner, StatCard, cx } from "../core/components/ui";
import { fmtTime, fmtUsd, shortAddress } from "../core/lib/format";

function Addr({ address, me }: { address: string | null | undefined; me?: string }) {
  if (!address) return <span className="text-subtle">—</span>;
  const label = labelFor(address, me);
  return (
    <span className="whitespace-nowrap" title={address}>
      {label ? (
        <span className={cx("font-medium", isContract(address) ? "text-accent" : label === "You" ? "text-positive" : "text-ink")}>{label}</span>
      ) : (
        <span className="font-mono text-[12px]">{shortAddress(address)}</span>
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: ExplorerTx["status"] }) {
  return status === "success" ? (
    <Badge tone="positive">
      <CheckCircle2 size={11} /> Success
    </Badge>
  ) : (
    <Badge tone="negative">
      <XCircle size={11} /> Reverted
    </Badge>
  );
}

function TxDetail({ tx, me }: { tx: ExplorerTx; me?: string }) {
  const call = decodeCall(tx.to, tx.input, me);
  const events = decodeLogs(tx.logs, me);
  return (
    <div className="space-y-4 text-[13px]">
      <div className="divide-y divide-line rounded-xl bg-sunken/60 px-3.5">
        <KeyValue label="Status" value={<StatusBadge status={tx.status} />} />
        <KeyValue label="Block" value={`#${tx.blockNumber} · ${fmtTime(tx.timestamp)}`} />
        <KeyValue label="From" value={<Addr address={tx.from} me={me} />} />
        <KeyValue label="To" value={tx.to ? <Addr address={tx.to} me={me} /> : <>New contract <Addr address={tx.contractAddress} me={me} /></>} />
        <KeyValue label="Gas used" value={tx.gasUsed.toLocaleString()} />
      </div>
      <div>
        <p className="mb-1.5 font-medium">Function called</p>
        <div className="rounded-xl border border-line p-3">
          <p className="font-mono text-[13px] font-semibold text-accent">{call.method}</p>
          {call.args.map((a) => (
            <p key={a.name} className="mt-1 font-mono text-[12px] break-all text-muted">
              {a.name}: <span className="text-ink">{a.value}</span>
            </p>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 font-medium">Events emitted ({events.length})</p>
        {events.length === 0 ? (
          <p className="text-muted">None{tx.status === "reverted" && " — a reverted transaction changes nothing and emits no events."}</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e, i) => (
              <li key={i} className="rounded-xl border border-line p-3">
                <p className="font-mono text-[12px]">
                  <span className="text-subtle">{e.contract}.</span>
                  <span className="font-semibold text-ink">{e.name}</span>
                </p>
                {e.args.map((a) => (
                  <p key={a.name} className="mt-0.5 font-mono text-[12px] break-all text-muted">
                    {a.name}: <span className="text-ink">{a.value}</span>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="font-mono text-[11px] break-all text-subtle">{tx.hash}</p>
    </div>
  );
}

export default function ExplorerPage() {
  const { address: me } = useAccount();
  const chainId = useChainId();
  const chain = useRecentChain(40);
  const protocol = useProtocolState();
  const users = useAllUsers();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ExplorerTx | null>(null);

  const q = query.trim().toLowerCase();
  const txs = useMemo(() => {
    const all = chain.data?.txs ?? [];
    if (!q) return all;
    if (/^\d+$/.test(q)) return all.filter((t) => t.blockNumber.toString() === q);
    return all.filter(
      (t) =>
        t.hash.toLowerCase().includes(q) ||
        t.from.toLowerCase().includes(q) ||
        (t.to ?? "").toLowerCase().includes(q) ||
        (labelFor(t.from, me) ?? "").toLowerCase().includes(q) ||
        (labelFor(t.to, me) ?? "").toLowerCase().includes(q) ||
        decodeCall(t.to, t.input).method.toLowerCase().includes(q),
    );
  }, [chain.data, q, me]);

  const latestBlock = chain.data?.blocks[0];
  const owed = (protocol.totalDeposits ?? 0n) + (protocol.totalReserves ?? 0n);
  const surplus = protocol.vaultBalance !== undefined ? protocol.vaultBalance - owed : undefined;

  return (
    <>
      <PageHeader title="Blockchain Explorer" subtitle="A live view of the local chain: every block, transaction, event and user position." />

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4 @3xl:gap-4">
        <StatCard label="Latest block" value={chain.data ? `#${chain.data.latest}` : "—"} sub="Updates live" />
        <StatCard label="Chain ID" value={String(chainId)} sub="Anvil (local)" />
        <StatCard
          label="Chain time"
          value={latestBlock ? new Date(latestBlock.timestamp * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"}
          sub={latestBlock ? new Date(latestBlock.timestamp * 1000).toLocaleTimeString() : undefined}
          info="Timestamp of the latest block. The chain runs on real time."
        />
        <StatCard label="Users" value={users.data ? String(users.data.length) : "—"} sub={`${protocol.positionsOpened ?? "—"} perp positions opened`} />
      </div>

      <div className="mt-5 grid items-start gap-5 @4xl:grid-cols-3">
        <Card
          title="Vault solvency"
          info="Checks the vault's core rule live: the tokens it holds must cover everything it owes to users and module pools."
          className="@4xl:col-span-2"
          action={
            protocol.solvent === undefined ? null : protocol.solvent ? (
              <Badge tone="positive">
                <ShieldCheck size={12} /> Solvent
              </Badge>
            ) : (
              <Badge tone="negative">
                <ShieldAlert size={12} /> Insolvent
              </Badge>
            )
          }
        >
          {protocol.vaultBalance === undefined ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <AllocationBar
                total={protocol.vaultBalance}
                segments={[
                  { key: "users", label: "Owed to users", value: protocol.totalDeposits ?? 0n, color: "var(--color-free)" },
                  { key: "perps", label: "Perps pool", value: protocol.perpsPool ?? 0n, color: "var(--color-perps)" },
                  { key: "lending", label: "Lending pool", value: protocol.lendingPool ?? 0n, color: "var(--color-lending)" },
                ]}
              />
              <div className="mt-4 grid gap-x-8 border-t border-line pt-2 sm:grid-cols-2">
                <KeyValue label="mUSDC held by the vault" value={fmtUsd(protocol.vaultBalance)} />
                <KeyValue label="Total owed (users + pools)" value={fmtUsd(owed)} />
                <KeyValue label="Unclaimed surplus" value={surplus === undefined ? "—" : fmtUsd(surplus)} info="Tokens sent straight to the vault without a deposit. Normally zero." />
                <KeyValue label="Registered modules" value={protocol.modules ? protocol.modules.map((m) => labelFor(m) ?? shortAddress(m)).join(", ") : "—"} />
              </div>
            </>
          )}
        </Card>

        <Card title="Contracts" info="Everything deployed by the deploy script.">
          <ul className="space-y-2.5">
            {CONTRACT_DIRECTORY.map((c) => (
              <li key={c.address}>
                <p className="text-[13px] font-semibold text-accent">{c.name}</p>
                <p className="text-xs text-muted">{c.role}</p>
                <p className="font-mono text-[11px] break-all text-subtle">{c.address}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <LiquidationsCard className="mt-5" />

      <Card title="All users" className="mt-5" padded={false} info="Every address that has deposited, with its live position. Each wallet has its own separate ledger entry.">
        {users.isLoading ? (
          <Spinner />
        ) : !users.data?.length ? (
          <EmptyState icon={<Users size={18} />} title="No users yet" body="Addresses appear here after their first deposit." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead>
                <tr className="border-y border-line text-xs text-subtle">
                  <th className="px-5 py-2.5 font-medium sm:px-6">Address</th>
                  <th className="px-3 py-2.5 text-right font-medium">Deposited</th>
                  <th className="px-3 py-2.5 text-right font-medium">Available</th>
                  <th className="px-3 py-2.5 text-right font-medium">Perps lock</th>
                  <th className="px-3 py-2.5 text-right font-medium">Lending lock</th>
                  <th className="px-3 py-2.5 text-right font-medium">Debt</th>
                  <th className="px-5 py-2.5 text-right font-medium sm:px-6">Health</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {users.data.map((u) => (
                  <tr key={u.address} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 sm:px-6">
                      <Addr address={u.address} me={me} />
                      <p className="font-mono text-[11px] text-subtle">{shortAddress(u.address)}</p>
                    </td>
                    <td className="px-3 py-3 text-right">{fmtUsd(u.deposits)}</td>
                    <td className="px-3 py-3 text-right">{fmtUsd(u.free)}</td>
                    <td className="px-3 py-3 text-right">{fmtUsd(u.lockedPerps)}</td>
                    <td className="px-3 py-3 text-right">{fmtUsd(u.lockedLending)}</td>
                    <td className="px-3 py-3 text-right">{fmtUsd(u.debt)}</td>
                    <td className={cx("px-5 py-3 text-right font-medium sm:px-6", u.health !== null && u.health < 1 && "text-negative")}>{fmtHealth(u.health)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-5 grid gap-5 @4xl:grid-cols-3">
        <Card title="Latest blocks" info="Anvil mines a new block for every transaction.">
          {chain.isLoading ? (
            <Spinner />
          ) : (
            <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
              {chain.data?.blocks.map((b) => (
                <li key={String(b.number)}>
                  <button onClick={() => setQuery(String(b.number))} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-sunken/50">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sunken text-muted">
                        <Blocks size={15} />
                      </span>
                      <span>
                        <span className="block text-[13px] font-semibold">#{String(b.number)}</span>
                        <span className="tabular block text-[11px] text-subtle">{fmtTime(b.timestamp)}</span>
                      </span>
                    </span>
                    <span className="text-right text-[12px] text-muted">
                      {b.txCount} tx{b.txCount === 1 ? "" : "s"}
                      <span className="tabular block text-[11px] text-subtle">gas {b.gasUsed.toLocaleString()}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Transactions"
          className="@4xl:col-span-2"
          padded={false}
          action={<span className="text-xs text-subtle">Last 40 blocks · click a row for details</span>}
        >
          <div className="px-5 pb-3 sm:px-6">
            <label className="flex items-center gap-2 rounded-xl border border-line-strong px-3 focus-within:border-accent">
              <Search size={15} className="text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by block number, tx hash, address, contract or function (e.g. deposit)"
                className="h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-xs text-muted hover:text-ink">
                  Clear
                </button>
              )}
            </label>
          </div>
          {chain.isLoading ? (
            <Spinner label="Reading the chain…" />
          ) : txs.length === 0 ? (
            <EmptyState title="No matching transactions" />
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-y border-line text-xs text-subtle">
                    <th className="px-5 py-2.5 font-medium sm:px-6">Function</th>
                    <th className="px-3 py-2.5 font-medium">From → To</th>
                    <th className="px-3 py-2.5 font-medium">Block</th>
                    <th className="px-5 py-2.5 font-medium sm:px-6">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.hash} onClick={() => setSelected(t)} className="cursor-pointer border-b border-line last:border-0 hover:bg-sunken/50">
                      <td className="px-5 py-2.5 sm:px-6">
                        <p className="font-mono text-[12px] font-semibold text-ink">{decodeCall(t.to, t.input).method}</p>
                        <p className="font-mono text-[11px] text-subtle">{shortAddress(t.hash)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Addr address={t.from} me={me} /> <span className="text-subtle">→</span> {t.to ? <Addr address={t.to} me={me} /> : <span className="text-muted">new contract</span>}
                      </td>
                      <td className="tabular px-3 py-2.5 text-muted">#{String(t.blockNumber)}</td>
                      <td className="px-5 py-2.5 sm:px-6">
                        <StatusBadge status={t.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Transaction">
        {selected && <TxDetail tx={selected} me={me} />}
      </Modal>
    </>
  );
}
