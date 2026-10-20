import { CandlestickChart } from "lucide-react";
import { Card, EmptyState } from "../../core/components/ui";
import { PageHeader } from "../../core/components/PageHeader";

// Placeholder until Phase 5b — the contract is deployed and tested; the trading UI is next.
export default function PerpsPage() {
  return (
    <>
      <PageHeader title="Perpetuals" subtitle="Trade ETH/USD with leverage using collateral from the shared vault." />
      <Card>
        <EmptyState icon={<CandlestickChart size={20} />} title="Trading screen coming in the next step" body="Placeholder — this page is not built yet." />
      </Card>
    </>
  );
}
