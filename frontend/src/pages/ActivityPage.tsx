import { useMemo, useState, useSyncExternalStore } from "react";
import { useAccount } from "wagmi";
import { History } from "lucide-react";
import { useActivity } from "../core/hooks/useActivity";
import { readFailures, subscribeFailures } from "../core/lib/sessionLog";
import { PageHeader } from "../core/components/PageHeader";
import { ActivityTable } from "../core/components/ActivityTable";
import { Badge, Card, EmptyState, Spinner } from "../core/components/ui";
import { fmtTime } from "../core/lib/format";

const MODULES = ["All", "Core", "Perpetuals", "Lending"] as const;
const STATUSES = ["Confirmed", "Failed (this browser)"] as const;

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export default function ActivityPage() {
  const { address } = useAccount();
  const activity = useActivity();
  const failuresAll = useSyncExternalStore(subscribeFailures, readFailures);
  const failures = failuresAll.filter((f) => f.account.toLowerCase() === address?.toLowerCase());

  const [module, setModule] = useState<(typeof MODULES)[number]>("All");
  const [type, setType] = useState("All");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Confirmed");

  const types = useMemo(() => ["All", ...new Set((activity.data ?? []).map((i) => i.type.split(" · ")[0]))], [activity.data]);
  const items = (activity.data ?? []).filter(
    (i) => (module === "All" || i.module === module) && (type === "All" || i.type.startsWith(type)),
  );
  const failedItems = failures.filter((f) => module === "All" || f.module === module);

  return (
    <>
      <PageHeader title="Activity" subtitle="Every transaction across the vault and modules, read from on-chain events." />

      <Card>
        <div className="mb-5 flex flex-wrap gap-3">
          <Select label="Module" value={module} options={MODULES} onChange={setModule} />
          {status === "Confirmed" && <Select label="Type" value={type} options={types} onChange={setType} />}
          <Select label="Status" value={status} options={STATUSES} onChange={setStatus} />
        </div>

        {status === "Confirmed" ? (
          activity.isLoading ? (
            <Spinner label="Reading events…" />
          ) : activity.isError ? (
            <EmptyState title="Couldn't read events" body="Is the local chain (Anvil) running?" />
          ) : items.length === 0 ? (
            <EmptyState icon={<History size={18} />} title="No matching transactions" />
          ) : (
            <ActivityTable items={items} />
          )
        ) : (
          <>
            <p className="mb-3 text-xs text-subtle">
              Failed or rejected actions never reach the blockchain, so they are only remembered in this browser.
            </p>
            {failedItems.length === 0 ? (
              <EmptyState title="No failed actions" />
            ) : (
              <ul className="divide-y divide-line">
                {failedItems.map((f) => (
                  <li key={f.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{f.label}</p>
                      <p className="text-xs text-muted">{f.message}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular text-xs text-subtle">{fmtTime(f.time)}</span>
                      <Badge tone="negative">Failed</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </>
  );
}
