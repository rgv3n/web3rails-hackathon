import Link from "next/link";
import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, Notice, PageTitle } from "@/components/ui";
import { EXPORT_COLUMNS_V1 } from "@/lib/export-csv";
import { ExportForm } from "./ExportForm";

export const metadata = { title: "Exports" };

export default async function ExportsPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const canExport = can(ctx, "approve") || can(ctx, "manage_org");
  const [{ data: entities }, { data: exportsList }, { count: approved }, { count: pending }] = await Promise.all([
    supabase.from("legal_entities").select("id, name").eq("org_id", ctx.org.id).order("name"),
    supabase.from("exports").select("id, period_from, period_to, record_count, schema_version, checksum_sha256, status, created_at, entity:legal_entities(name), author:profiles!exports_created_by_fkey(full_name)").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("movements").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("review_status", "approved"),
    supabase.from("movements").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).neq("review_status", "approved"),
  ]);
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  return (
    <>
      <PageTitle title="Evidence and exports" text="Each export is a snapshot of approved revisions. Later corrections never change an earlier export." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card className="px-5 py-4"><p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Approved movements</p><p className="tabular mt-1 font-mono text-2xl">{approved ?? "—"}</p></Card>
        <Card className="px-5 py-4"><p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Not yet approved</p><p className="tabular mt-1 font-mono text-2xl">{pending ?? "—"}</p><Link href="/app/movements?filter=needs_review" className="text-xs text-fg-muted hover:underline">See what blocks the close</Link></Card>
      </div>
      <Card>
        <CardHeader title="New export" text={`CSV schema v1 · ${EXPORT_COLUMNS_V1.length} columns · amounts exact, text fields neutralised against spreadsheet formulas.`} />
        <div className="p-5">
          {canExport ? <ExportForm entities={entities ?? []} defaultFrom={first} defaultTo={today.toISOString().slice(0, 10)} /> : <Notice>Only reviewers and admins create exports.</Notice>}
        </div>
      </Card>
      <Card className="mt-6">
        <CardHeader title="History" text="Every export stays downloadable with its original rows and checksum." />
        {exportsList && exportsList.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-fg-muted">
              <tr className="border-b border-line"><th className="px-5 py-2.5 font-medium">Created</th><th className="px-5 py-2.5 font-medium">Period</th><th className="px-5 py-2.5 font-medium">Entity</th><th className="px-5 py-2.5 text-right font-medium">Records</th><th className="px-5 py-2.5 font-medium">Checksum</th><th className="px-5 py-2.5 font-medium">By</th><th className="px-5 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {exportsList.map((e) => {
                const ent = e.entity as unknown as { name: string } | null;
                const by = e.author as unknown as { full_name: string | null } | null;
                return (
                  <tr key={e.id}>
                    <td className="px-5 py-2 font-mono text-xs text-fg-muted">{new Date(e.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.org.timezone })}</td>
                    <td className="px-5 py-2 font-mono text-xs">{e.period_from} → {e.period_to}</td>
                    <td className="px-5 py-2">{ent?.name ?? "All"}</td>
                    <td className="tabular px-5 py-2 text-right font-mono text-xs">{e.record_count}</td>
                    <td className="px-5 py-2 font-mono text-xs text-fg-muted" title={e.checksum_sha256 ?? ""}>{e.checksum_sha256 ? e.checksum_sha256.slice(0, 12) + "…" : <Badge tone="warn">no checksum</Badge>}</td>
                    <td className="px-5 py-2">{by?.full_name ?? "—"}</td>
                    <td className="px-5 py-2 text-right"><a href={`/app/exports/${e.id}/download`} className="font-medium hover:underline">Download CSV</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="px-5 py-4 text-sm text-fg-muted">No exports yet.</p>}
      </Card>
    </>
  );
}
