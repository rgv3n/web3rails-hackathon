import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { formatFiat } from "@/lib/money";
import type { MovementRow } from "../movements/queries";
import { openInvoicesFor, proposalsFor, signalLabel } from "./queries";
import { AcceptRejectForm, ManualLinkForm, UnlinkForm } from "./DecisionForms";

/** Block 3 of the movement detail and the body of each reconciliation card. Server component. */
export async function ReconciliationBlock({ supabase, orgId, m, canDecide, tolerance }: { supabase: SupabaseClient; orgId: string; m: MovementRow; canDecide: boolean; tolerance: string }) {
  if (m.reconciliation_status === "not_applicable") {
    return <p className="text-sm text-fg-muted">Not applicable: the category ({m.context?.category.replace(/_/g, " ")}) does not require an invoice.</p>;
  }

  if (m.reconciliation_status === "matched") {
    const { data: inv } = await supabase.from("invoices").select("id, external_ref, counterparty_name, amount:amount_text, currency").eq("linked_movement_id", m.id).maybeSingle();
    const { data: dec } = await supabase
      .from("match_decisions")
      .select("kind, reason, decided_at, actor:profiles!match_decisions_actor_id_fkey(full_name), proposal:match_proposals(signals, differences)")
      .eq("movement_id", m.id)
      .in("kind", ["accept", "manual_link"])
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const actor = dec?.actor as unknown as { full_name: string | null } | null;
    const prop = dec?.proposal as unknown as { signals: string[] } | null;
    return (
      <div className="space-y-3 text-sm">
        <p>
          Matched to <span className="font-mono text-xs">{inv?.external_ref}</span> · {inv?.counterparty_name} · <span className="font-mono text-xs">{inv?.amount} {inv?.currency}</span>
        </p>
        <p className="text-xs text-fg-muted">
          {dec?.kind === "manual_link" ? "Linked manually" : "Proposal accepted"} by {actor?.full_name ?? "—"} on {dec ? new Date(dec.decided_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}
          {dec?.reason ? ` · “${dec.reason}”` : ""}
        </p>
        {prop?.signals?.length ? <ul className="flex flex-wrap gap-1">{prop.signals.map((s) => <li key={s}><Badge tone="ok">{signalLabel[s] ?? s}</Badge></li>)}</ul> : null}
        {canDecide ? <UnlinkForm movementId={m.id} version={m.context_version} /> : null}
      </div>
    );
  }

  const proposals = await proposalsFor(supabase, m.id);
  const invoices = canDecide && m.entity ? await openInvoicesFor(supabase, orgId, m.entity.id, m.token_mint, m.direction === "in" ? "receivable" : "payable") : [];
  const ambiguous = proposals.length > 1;

  return (
    <div className="space-y-4 text-sm">
      {proposals.length === 0 ? (
        <p className="text-fg-muted">
          No candidate. Candidates need the same entity, token and direction and either an exact reference or an amount within the tolerance ({tolerance} token units).
          {m.identification_status === "unidentified" ? " Add financial context (counterparty, reference) to improve matching." : ""}
        </p>
      ) : (
        <>
          <p className="text-fg-muted">
            {ambiguous ? `${proposals.length} compatible invoices. Nothing is chosen automatically: pick one or reject.` : "One compatible invoice. Accepting is an explicit decision recorded with your name."}
          </p>
          <ul className="divide-y divide-line rounded-md border border-line">
            {proposals.map((p) => (
              <li key={p.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-mono text-xs">{p.invoice?.external_ref}</span> · {p.invoice?.counterparty_name}
                  </span>
                  <span className="tabular font-mono text-xs">{p.invoice?.amount} {p.invoice?.currency} · issued {p.invoice?.issued_at}{p.invoice?.due_at ? ` · due ${p.invoice.due_at}` : ""}</span>
                </div>
                <ul className="flex flex-wrap gap-1">
                  {Object.keys(signalLabel).map((s) => (
                    <li key={s}><Badge tone={p.signals.includes(s) ? "ok" : "neutral"}>{p.signals.includes(s) ? "✓ " : "· "}{signalLabel[s]}</Badge></li>
                  ))}
                </ul>
                <p className="text-xs text-fg-muted">
                  Difference {p.differences.amount_diff} (tolerance {p.differences.tolerance}) · {typeof p.differences.days_from_due === "number" ? `${p.differences.days_from_due} days from due date` : ""}
                </p>
                {canDecide ? <AcceptRejectForm movementId={m.id} invoiceId={p.invoice_id} version={m.context_version} /> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {canDecide ? <ManualLinkForm movementId={m.id} version={m.context_version} invoices={invoices} /> : null}
      {!canDecide ? <p className="text-xs text-fg-subtle">Your role cannot decide matches.</p> : null}
      <p className="text-xs text-fg-subtle">
        Valuation: {m.valuation ? formatFiat(m.valuation.fiat_amount, m.valuation.currency) : "No valuation"} (no rate source configured). <Link href="/app/invoices" className="underline-offset-4 hover:underline">Invoices</Link>
      </p>
    </div>
  );
}
