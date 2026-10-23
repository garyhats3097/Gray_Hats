import { anvilLocal } from "../config/chain";
import { contracts, COLLATERAL_SYMBOL } from "../config/contracts";
import { PageHeader } from "../core/components/PageHeader";
import { Callout, Card } from "../core/components/ui";

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{n}</span>
    <div className="text-sm leading-relaxed text-ink">{children}</div>
  </li>
);

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help & Setup" subtitle="Connect MetaMask to the local prototype chain." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Add the local network to MetaMask">
          <ol className="space-y-3">
            <Step n={1}>Make sure the chain is running (<code className="rounded bg-sunken px-1">./scripts/start-chain.sh</code> in a terminal).</Step>
            <Step n={2}>
              MetaMask → network menu → <b>Add a custom network</b>.
            </Step>
            <Step n={3}>
              Network name <b>{anvilLocal.name}</b>, RPC URL <b>{anvilLocal.rpcUrls.default.http[0]}</b>, Chain ID <b>{anvilLocal.id}</b>, currency <b>ETH</b>.
            </Step>
            <Step n={4}>
              Import a test account: MetaMask → <b>Add account → Import account</b>, and paste one of the private keys Anvil prints at start-up (e.g. account #1).
            </Step>
            <Step n={5}>Connect your wallet here, use the faucet for test {COLLATERAL_SYMBOL}, then deposit.</Step>
          </ol>
          <div className="mt-5">
            <Callout tone="warning">
              Anvil's private keys are public. Only use them on the local test network, and never send real funds to them. We never ask for your seed phrase.
            </Callout>
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="Troubleshooting">
            <ul className="space-y-3 text-sm leading-relaxed">
              <li>
                <b>"Nonce too high" after resetting the chain:</b> MetaMask → Settings → Advanced → <b>Clear activity tab data</b>.
              </li>
              <li>
                <b>Balances look empty:</b> plain <code className="rounded bg-sunken px-1">anvil</code> was started, which forgets everything. Stop it and run <code className="rounded bg-sunken px-1">./scripts/start-chain.sh</code> instead — it keeps your chain between restarts.
              </li>
              <li>
                <b>Old positions or loans are missing:</b> the chain was started with plain <code className="rounded bg-sunken px-1">anvil</code>, which doesn't save. Always use{" "}
                <code className="rounded bg-sunken px-1">./scripts/start-chain.sh</code>; it refuses to start if another chain is already running.
              </li>
              <li>
                <b>Lending shows $0 even though Loan history has entries:</b> the chain was time-travelled and then restarted with an older start
                script, so its clock went backwards. Run <code className="rounded bg-sunken px-1">git pull</code> and restart with{" "}
                <code className="rounded bg-sunken px-1">./scripts/start-chain.sh</code>; it repairs the clock. No data is lost.
              </li>
              <li>
                <b>Deposited, but Lending shows $0 collateral:</b> vault deposits only become Lending collateral after you <b>Allocate</b> them on the Lending page.
              </li>
              <li>
                <b>"Wrong network":</b> use the Switch network button, or pick {anvilLocal.name} in MetaMask.
              </li>
            </ul>
          </Card>
          <Card title="How it works">
            <ul className="space-y-2 text-sm leading-relaxed text-muted">
              <li>
                <b className="text-ink">Shared Vault</b> holds all collateral. Only <i>available</i> collateral can be withdrawn.
              </li>
              <li>
                <b className="text-ink">Modules</b> (Perpetuals, Lending) lock collateral through the vault. A loss in one module can only come out of what that module locked.
              </li>
              <li>
                <b className="text-ink">Test data:</b> {COLLATERAL_SYMBOL} is a mock token, prices come from a mock oracle, and module pools were seeded by the deploy script.
              </li>
            </ul>
            <p className="mt-4 font-mono text-[11px] break-all text-subtle">Vault {contracts.vault.address}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
