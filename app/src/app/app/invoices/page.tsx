import Link from "next/link";
import { Upload } from "lucide-react";
import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Badge, Button, Card, PageTitle } from "@/components/ui";
import { trimDecimal } from "@/lib/money";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && ["open", "matched", "void"].includes(sp.status) ? sp.status : "";
  const ctx = await requireOrg();
  const supabase = await createClient();
  let q = supabase
    .from("invoices")
    .select("id, external_ref, counterparty_name, kind, amount:amount_text, currency, token_mint, issued_at, due_at, status, linked_movement_id, entity:legal_entities(name)")
    .eq("org_id", ctx.org.id)
    .order("issued_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  const { data: invoices } = await q;

  return (
    <>
      <PageTitle
        title="Invoices"
        text="What movements are matched against. One invoice links to at most one movement in this version."
        action={can(ctx, "import") ? <Link href="/app/invoices/import"><Button variant="secondary"><Upload className="h-4 w-4" /> Import CSV</Button></Link> : null}
      />
      <div className="mb-4 flex gap-1">
        {[["", "All"], ["open", "Open"], ["matched", "Matched"], ["void", "Void"]].map(([v, l]) => (
          <Link key={v} href={v ? `/app/invoices?status=${v}` : "/app/invoices"} className={`rounded-md border px-3 py-1.5 text-sm ${status === v ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg-muted hover:text-fg"}`}>{l}</Link>
        ))}
      </div>
      <Card>
        {invoices && invoices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 font-medium">Reference</th><th className="px-4 py-2.5 font-medium">Counterparty</th><th className="px-4 py-2.5 font-medium">Entity</th><th className="px-4 py-2.5 font-medium">Kind</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th><th className="px-4 py-2.5 font-medium">Issued</th><th className="px-4 py-2.5 font-medium">Due</th><th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((i) => {
                  const ent = i.entity as unknown as { name: string } | null;
                  return (
                    <tr key={i.id}>
                      <td className="px-4 py-2.5 font-mono text-xs">{i.external_ref}</td>
                      <td className="px-4 py-2.5">{i.counterparty_name}</td>
                      <td className="px-4 py-2.5 text-fg-muted">{ent?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 capitalize text-fg-muted">{i.kind}</td>
                      <td className="tabular px-4 py-2.5 text-right font-mono text-xs">{trimDecimal(i.amount)} {i.currency}{!i.token_mint ? <span className="ml-1 text-fg-subtle" title="Not a known stablecoin: cannot be matched without a valuation">·fiat</span> : null}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{i.issued_at}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{i.due_at ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        {i.status === "matched" && i.linked_movement_id ? (
                          <Link href={`/app/movements/${i.linked_movement_id}`}><Badge tone="ok">Matched</Badge></Link>
                        ) : (
                          <Badge tone={i.status === "void" ? "neutral" : "accent"}>{i.status === "open" ? "Open" : "Void"}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-fg-muted">No invoices{status ? ` with status ${status}` : ""}.</p>
        )}
      </Card>
    </>
  );
}
