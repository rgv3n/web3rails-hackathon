import { redirect } from "next/navigation";
import { can, requireOrg } from "@/lib/org";
import { Card, CardHeader, Notice, PageTitle } from "@/components/ui";
import { InvoiceImportWizard } from "./InvoiceImportWizard";

export const metadata = { title: "Import invoices" };

export default async function InvoiceImportPage() {
  const ctx = await requireOrg();
  if (!can(ctx, "import")) redirect("/app/invoices");
  return (
    <>
      <PageTitle title="Import invoices" text="Open invoices to match against movements. The reference is the idempotency key: re-importing the same reference never duplicates." />
      <Card>
        <CardHeader
          title="CSV file"
          text="Columns: external_ref, counterparty_name, kind (receivable|payable), amount (decimal), currency (USDC, USDT, EURC or a fiat code), issued_at; optional due_at, entity_name, document_ref."
        />
        <div className="p-5">
          <Notice>Only invoices denominated in a known stablecoin can be matched. Fiat invoices import but stay unmatched until a valuation source exists.</Notice>
          <div className="mt-4">
            <InvoiceImportWizard />
          </div>
        </div>
      </Card>
    </>
  );
}
