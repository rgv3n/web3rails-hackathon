import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireOrg } from "@/lib/org";
import { Badge, Card, CardHeader, PageTitle } from "@/components/ui";

export const metadata = { title: "Overview" };

const modules = [
  { name: "Wallets", text: "Add Solana addresses. Read-only sync of stablecoin transfers.", status: "building" },
  { name: "Transactions", text: "One normalized record per movement, with fiat value at settlement and its source.", status: "building" },
  { name: "Invoices", text: "Import open invoices by CSV and keep their payment status.", status: "building" },
  { name: "Review queue", text: "Low-confidence matches wait here with a reason. Nothing is accepted silently.", status: "building" },
  { name: "Exports", text: "Reconciled records by period, with evidence references.", status: "building" },
] as const;

export default async function OverviewPage() {
  const ctx = await requireOrg();
  return (
    <>
      <PageTitle title={ctx.org.name} text={`Base currency ${ctx.org.base_currency} · ${ctx.org.timezone}`} />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Wallets", "0"],
          ["Transactions", "0"],
          ["Open exceptions", "0"],
        ].map(([label, value]) => (
          <Card key={label} className="px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
            <p className="tabular mt-1 font-mono text-2xl">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader title="Get started" text="Your account and organization exist. The next step is connecting data." />
        <ol className="divide-y divide-line">
          {[
            ["Review integrations and request the ones you need", "/app/integrations", true],
            ["Create an API key for your systems", "/app/integrations#api", true],
            ["Invite your finance team", "/app/team", true],
            ["Add your first wallet", null, false],
          ].map(([label, href, ready], i) => (
            <li key={String(label)} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <span className="flex items-center gap-3">
                <span className="tabular inline-flex h-6 w-6 items-center justify-center rounded-full border border-line font-mono text-xs text-fg-muted">
                  {i + 1}
                </span>
                {label}
              </span>
              {ready && href ? (
                <Link href={String(href)} className="inline-flex items-center gap-1 font-medium text-fg hover:underline">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <Badge>In development</Badge>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Modules" text="What this workspace will do. Status is product truth, not marketing." />
        <ul className="divide-y divide-line">
          {modules.map((m) => (
            <li key={m.name} className="flex items-start justify-between gap-4 px-5 py-3">
              <div>
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-sm text-fg-muted">{m.text}</p>
              </div>
              <Badge>In development</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
