import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, PageTitle } from "@/components/ui";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const [wallets, movements, unidentified, openExceptions, lastBatchRes] = await Promise.all([
    supabase.from("wallets").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("status", "active"),
    supabase.from("movements").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id),
    supabase.from("movements").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("identification_status", "unidentified"),
    supabase.from("exceptions").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).neq("status", "resolved"),
    supabase.from("import_batches").select("created_at, filename, rows_error").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const lastBatch = lastBatchRes.data;

  const tiles: { label: string; value: number | null; href: string; note?: string }[] = [
    { label: "Declared wallets", value: wallets.count, href: "/app/organization" },
    { label: "Movements", value: movements.count, href: "/app/movements" },
    { label: "Needs context", value: unidentified.count, href: "/app/movements?filter=needs_review", note: "unidentified" },
    { label: "Open exceptions", value: openExceptions.count, href: "/app/movements?filter=discrepancy" },
  ];

  const steps: { label: string; href: string | null; done: boolean }[] = [
    { label: "Declare your first wallet", href: "/app/organization", done: (wallets.count ?? 0) > 0 },
    { label: "Import movements (CSV)", href: can(ctx, "import") ? "/app/movements/import" : null, done: (movements.count ?? 0) > 0 },
    { label: "Add financial context to unidentified movements", href: "/app/movements?filter=needs_review", done: (movements.count ?? 0) > 0 && (unidentified.count ?? 0) === 0 },
    { label: "Import invoices and review matches", href: "/app/reconciliation", done: (movements.count ?? 0) > 0 && (unidentified.count ?? 0) === 0 && (openExceptions.count ?? 0) === 0 },
    { label: "Approve and export with evidence", href: "/app/exports", done: false },
  ];

  return (
    <>
      <PageTitle title={ctx.org.name} text={`Base currency ${ctx.org.base_currency} · ${ctx.org.timezone}${ctx.org.is_demo ? " · Demo data" : ""}`} />

      <div className="grid gap-4 sm:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="h-full px-5 py-4 hover:bg-surface-2/60">
              <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{t.label}</p>
              <p className="tabular mt-1 font-mono text-2xl">{t.value ?? "—"}</p>
              {t.note ? <p className="text-xs text-fg-subtle">{t.note}</p> : null}
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Sync status"
          text={
            lastBatch
              ? `Last import: ${lastBatch.filename} · ${new Date(lastBatch.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.org.timezone })}${lastBatch.rows_error ? ` · ${lastBatch.rows_error} rows rejected` : ""}`
              : "No imports yet."
          }
          action={<Badge>Chain sync: not configured</Badge>}
        />
        <p className="px-5 py-3 text-sm text-fg-muted">
          Movements arrive by explicit CSV import. Automatic wallet synchronization needs a chain data provider credential and is not enabled. Valuation: no rate source configured, so fiat values show as “No valuation”.
        </p>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Path to first export" />
        <ol className="divide-y divide-line">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <span className="flex items-center gap-3">
                <span className={`tabular inline-flex h-6 w-6 items-center justify-center rounded-full border font-mono text-xs ${s.done ? "border-ok bg-ok-soft text-ok" : "border-line text-fg-muted"}`}>
                  {s.done ? "✓" : i + 1}
                </span>
                {s.label}
              </span>
              {s.href ? (
                <Link href={s.href} className="inline-flex items-center gap-1 font-medium text-fg hover:underline">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <Badge>In development</Badge>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
