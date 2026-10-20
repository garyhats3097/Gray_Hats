import { HandCoins } from "lucide-react";
import { Card, EmptyState } from "../../core/components/ui";
import { PageHeader } from "../../core/components/PageHeader";

// Placeholder until Phase 5b — the contract is deployed and tested; the lending UI is next.
export default function LendingPage() {
  return (
    <>
      <PageHeader title="Lending" subtitle="Borrow mUSDC against collateral allocated from the shared vault." />
      <Card>
        <EmptyState icon={<HandCoins size={20} />} title="Lending screen coming in the next step" body="Placeholder — this page is not built yet." />
      </Card>
    </>
  );
}
