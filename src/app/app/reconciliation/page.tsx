import Link from "next/link";
import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { formatTokenAmount } from "@/lib/money";
import { Badge, Card, CardHeader, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { listMovements } from "../movements/queries";
import { ReconciliationBlock } from "./ReconciliationBlock";
import { rerunMatching } from "./actions";

export const metadata = { title: "Reconciliation" };

export default async function ReconciliationPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("matching_tolerance, matching_date_window_days").eq("id", ctx.org.id).single();
  const tolerance = String(org?.matching_tolerance ?? "0.01");
  // Movements with open proposals first (status proposed), then identified-but-unmatched.
  const { rows: proposed } = await listMovements(supabase, ctx.org.id, { pageSize: 50 });
  const withProposals = proposed.filter((m) => m.reconciliation_status === "proposed");
  const unmatched = proposed.filter((m) => m.reconciliation_status === "unmatched" && m.identification_status === "identified");
  const canDecide = can(ctx, "edit_context");

  return (
    <>
      <PageTitle
        title="Reconciliation"
        text={`Deterministic 1:1 matching. Tolerance ±${tolerance} token units, date window ${org?.matching_date_window_days ?? 30} days after due date. Signals are named, never scored. Nothing is accepted without a person.`}
        action={
          canDecide ? (
            <form action={rerunMatching}>
              <SubmitButton variant="secondary" pendingText="Running…">Re-run matching</SubmitButton>
            </form>
          ) : null
        }
      />
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">With candidates ({withProposals.length})</h2>
        {withProposals.length === 0 ? <Card className="px-5 py-6 text-sm text-fg-muted">No open proposals.</Card> : null}
        {withProposals.map((m) => (
          <Card key={m.id}>
            <CardHeader
              title={`${m.direction === "in" ? "+" : "−"}${formatTokenAmount(m.amount_raw, m.token_decimals)} ${m.token_symbol ?? ""} · ${m.context?.counterparty_name ?? "Unknown counterparty"}`}
              text={`${m.entity?.name ?? "—"} · ${new Date(m.block_time).toLocaleDateString("en-GB", { dateStyle: "medium" })} · ref ${m.context?.reference ?? "—"}`}
              action={<Link href={`/app/movements/${m.id}`} className="text-sm font-medium hover:underline">Open movement</Link>}
            />
            <div className="p-5">
              <ReconciliationBlock supabase={supabase} orgId={ctx.org.id} m={m} canDecide={canDecide} tolerance={tolerance} />
            </div>
          </Card>
        ))}
      </section>
      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Identified, no candidate ({unmatched.length})</h2>
        <Card>
          <ul className="divide-y divide-line text-sm">
            {unmatched.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4 px-5 py-2.5">
                <span>
                  <span className="font-mono text-xs">{m.direction === "in" ? "+" : "−"}{formatTokenAmount(m.amount_raw, m.token_decimals)} {m.token_symbol}</span> · {m.context?.counterparty_name ?? "—"} · {m.context?.reference ?? "no ref"}
                </span>
                <span className="flex items-center gap-2">
                  {m.open_exceptions[0] ? <Badge tone="warn">{m.open_exceptions[0].kind.replace(/_/g, " ")}</Badge> : null}
                  <Link href={`/app/movements/${m.id}`} className="font-medium hover:underline">Open</Link>
                </span>
              </li>
            ))}
            {unmatched.length === 0 ? <li className="px-5 py-4 text-fg-muted">Nothing waiting here.</li> : null}
          </ul>
        </Card>
      </section>
    </>
  );
}
