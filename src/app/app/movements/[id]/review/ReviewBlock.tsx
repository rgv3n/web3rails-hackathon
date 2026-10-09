import type { SupabaseClient } from "@supabase/supabase-js";
import { Badge } from "@/components/ui";
import type { MovementRow } from "../../queries";
import { ReviewForms } from "./ReviewForms";

export async function ReviewBlock({ supabase, m, canApprove, tz }: { supabase: SupabaseClient; m: MovementRow; canApprove: boolean; tz: string }) {
  const [{ data: blockers }, { data: reviews }] = await Promise.all([
    supabase.rpc("approval_blockers", { p_movement: m.id }),
    supabase.from("reviews").select("id, action, reason, context_version, decided_at, actor:profiles!reviews_actor_id_fkey(full_name)").eq("movement_id", m.id).order("decided_at", { ascending: false }).limit(10),
  ]);
  const list = (blockers as string[] | null) ?? [];
  const eligible = list.length === 0;
  const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz });

  return (
    <div className="space-y-4 text-sm">
      <p className="flex items-center gap-2">
        <span className="text-fg-muted">Status</span>
        <Badge tone={m.review_status === "approved" ? "ok" : m.review_status === "correction_requested" ? "warn" : "neutral"}>
          {m.review_status === "approved" ? "Approved" : m.review_status === "correction_requested" ? "Correction requested" : "Pending review"}
        </Badge>
      </p>
      {m.review_status !== "approved" ? (
        eligible ? (
          <p className="text-ok">Eligible for approval: context complete, reconciled, no open exceptions.</p>
        ) : (
          <div>
            <p className="font-medium text-warn">Cannot be approved yet</p>
            <ul className="mt-1 list-disc pl-5 text-fg-muted">
              {list.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        )
      ) : (
        <p className="text-fg-muted">A material change (context, invoice, category) sends it back to pending and keeps this approval in the history.</p>
      )}
      {canApprove && m.review_status !== "approved" ? <ReviewForms movementId={m.id} version={m.context_version} eligible={eligible} canReturn={m.review_status !== "correction_requested"} /> : null}
      {!canApprove ? <p className="text-xs text-fg-subtle">Only reviewers approve or return.</p> : null}
      {reviews && reviews.length > 0 ? (
        <ul className="divide-y divide-line rounded-md border border-line">
          {reviews.map((r) => {
            const actor = r.actor as unknown as { full_name: string | null } | null;
            return (
              <li key={r.id} className="px-3 py-2 text-xs">
                <span className="font-medium capitalize">{r.action}</span> · v{r.context_version} · {fmt(r.decided_at)} · {actor?.full_name ?? "system"}
                {r.reason ? <span className="text-fg-muted"> · “{r.reason}”</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
