import Link from "next/link";
import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { formatTokenAmount } from "@/lib/money";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ExceptionForm } from "./ExceptionForm";

export const metadata = { title: "Exceptions" };

const kindLabel: Record<string, string> = {
  import_discrepancy: "Re-import differs",
  missing_context: "Missing context",
  no_invoice: "No invoice",
  amount_mismatch: "Amount mismatch",
  ambiguous_match: "Ambiguous match",
  unsupported_partial: "Partial payment (unsupported)",
  currency_incompatible: "Currency incompatible",
  other: "Other",
};

export default async function ExceptionsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && ["open", "waiting", "resolved"].includes(sp.status) ? sp.status : "open";
  const mine = sp.mine === "1";
  const ctx = await requireOrg();
  const supabase = await createClient();
  let q = supabase
    .from("exceptions")
    .select(`id, kind, status, reason, resolution, assignee_id, comments, created_at, resolved_at,
      assignee:profiles!exceptions_assignee_id_fkey(full_name),
      movement:movements(id, direction, amount_raw:amount_raw_text, token_decimals, token_symbol, block_time, entity:legal_entities(name))`)
    .eq("org_id", ctx.org.id)
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(200);
  if (mine) q = q.eq("assignee_id", ctx.userId);
  const [{ data: items }, { data: members }] = await Promise.all([
    q,
    supabase.from("memberships").select("user_id, profiles:profiles!memberships_user_profile_fkey(full_name)").eq("org_id", ctx.org.id),
  ]);
  const memberOpts = (members ?? []).map((m) => ({ id: m.user_id as string, name: ((m.profiles as unknown as { full_name: string | null } | null)?.full_name ?? m.user_id) as string }));
  const canResolve = can(ctx, "edit_context");

  return (
    <>
      <PageTitle title="Exceptions" text="Everything that needs a person. Each one has a reason, an owner and a resolution with evidence. Nothing here is closed silently." />
      <div className="mb-4 flex flex-wrap gap-1">
        {["open", "waiting", "resolved"].map((s) => (
          <Link key={s} href={`/app/exceptions?status=${s}${mine ? "&mine=1" : ""}`} className={`rounded-md border px-3 py-1.5 text-sm capitalize ${status === s ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg-muted hover:text-fg"}`}>{s}</Link>
        ))}
        <Link href={`/app/exceptions?status=${status}${mine ? "" : "&mine=1"}`} className={`ml-2 rounded-md border px-3 py-1.5 text-sm ${mine ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg-muted hover:text-fg"}`}>Assigned to me</Link>
      </div>
      <div className="space-y-3">
        {(items ?? []).map((e) => {
          const mv = e.movement as unknown as { id: string; direction: string; amount_raw: string; token_decimals: number; token_symbol: string | null; block_time: string; entity: { name: string } | null } | null;
          const assignee = e.assignee as unknown as { full_name: string | null } | null;
          const comments = (e.comments as { by: string; at: string; text: string }[]) ?? [];
          return (
            <Card key={e.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Badge tone={e.status === "resolved" ? "ok" : e.status === "waiting" ? "accent" : "warn"}>{kindLabel[e.kind] ?? e.kind}</Badge>
                    {mv ? (
                      <Link href={`/app/movements/${mv.id}`} className="hover:underline">
                        {mv.direction === "in" ? "+" : "−"}{formatTokenAmount(mv.amount_raw, mv.token_decimals)} {mv.token_symbol} · {mv.entity?.name ?? "—"} · {new Date(mv.block_time).toLocaleDateString("en-GB", { dateStyle: "medium" })}
                      </Link>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-fg-muted">{e.reason}</p>
                </div>
                <p className="text-xs text-fg-subtle">
                  opened {new Date(e.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {assignee?.full_name ? `owner ${assignee.full_name}` : "unassigned"}
                </p>
              </div>
              {comments.length > 0 ? (
                <ul className="mt-2 space-y-0.5 text-xs text-fg-muted">
                  {comments.map((c, i) => (
                    <li key={i}>· {new Date(c.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}: {c.text}</li>
                  ))}
                </ul>
              ) : null}
              {e.resolution ? <p className="mt-2 text-sm"><span className="text-fg-muted">Resolution:</span> {e.resolution}</p> : null}
              {canResolve && e.status !== "resolved" ? (
                <div className="mt-3 border-t border-line pt-3">
                  <ExceptionForm id={e.id} status={e.status} assigneeId={e.assignee_id} members={memberOpts} />
                </div>
              ) : null}
            </Card>
          );
        })}
        {(items ?? []).length === 0 ? <Card className="px-5 py-8 text-center text-sm text-fg-muted">No {status} exceptions{mine ? " assigned to you" : ""}.</Card> : null}
      </div>
    </>
  );
}
