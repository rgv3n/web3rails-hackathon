import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";
import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { formatTokenAmount, formatFiat } from "@/lib/money";
import { Badge, Button, Card, Input, Notice, PageTitle, Select } from "@/components/ui";
import { attentionReason, categoryLabel, filterLabel, listMovements, reviewLabel, sortLabel, type MovementFilter, type MovementSort } from "./queries";
import { cn } from "@/lib/cn";

export const metadata = { title: "Movements" };

type SP = Record<string, string | string[] | undefined>;
const s = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function MovementsPage(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  const ctx = await requireOrg();
  const supabase = await createClient();
  const filter = (["all", "needs_review", "no_invoice", "discrepancy"].includes(s(sp.filter)) ? s(sp.filter) : "all") as MovementFilter;
  const sort = (Object.keys(sortLabel).includes(s(sp.sort)) ? s(sp.sort) : "date_desc") as MovementSort;
  const page = Math.max(1, Number(s(sp.page)) || 1);
  const params = { filter, entity: s(sp.entity), wallet: s(sp.wallet), from: s(sp.from), to: s(sp.to), q: s(sp.q), sort, page };

  const [{ data: entities }, { data: wallets }] = await Promise.all([
    supabase.from("legal_entities").select("id, name").eq("org_id", ctx.org.id).order("name"),
    supabase.from("wallets").select("id, label").eq("org_id", ctx.org.id).order("label"),
  ]);

  let rows: Awaited<ReturnType<typeof listMovements>>["rows"] = [];
  let total = 0;
  let loadError: string | null = null;
  try {
    ({ rows, total } = await listMovements(supabase, ctx.org.id, params));
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load movements.";
  }
  const { data: lastBatch } = await supabase.from("import_batches").select("created_at").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const qs = new URLSearchParams(
    Object.entries({ ...params, page: page > 1 ? String(page) : "", sort: sort !== "date_desc" ? sort : "" }).filter(([, v]) => v) as [string, string][],
  ).toString();
  const pageCount = Math.max(1, Math.ceil(total / 50));
  const pageHref = (n: number) => {
    const p = new URLSearchParams(qs);
    if (n > 1) p.set("page", String(n)); else p.delete("page");
    return `/app/movements?${p}`;
  };
  const backParam = qs ? `?back=${encodeURIComponent(qs)}` : "";

  return (
    <>
      <PageTitle
        title="Movements"
        text="Source records from the chain. Financial meaning is added as versioned context; the source is never edited."
        action={
          can(ctx, "import") ? (
            <Link href="/app/movements/import">
              <Button variant="secondary">
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-1">
        {(Object.keys(filterLabel) as MovementFilter[]).map((f) => {
          const p = new URLSearchParams(qs);
          p.set("filter", f);
          return (
            <Link
              key={f}
              href={`/app/movements?${p}`}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                filter === f ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg-muted hover:text-fg",
              )}
            >
              {filterLabel[f]}
            </Link>
          );
        })}
      </div>

      <form method="get" className="mb-4 grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
        <input type="hidden" name="filter" value={filter} />
        <Select name="entity" defaultValue={params.entity}>
          <option value="">All entities</option>
          {(entities ?? []).map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </Select>
        <Select name="wallet" defaultValue={params.wallet}>
          <option value="">All wallets</option>
          {(wallets ?? []).map((w) => (
            <option key={w.id} value={w.id}>{w.label}</option>
          ))}
        </Select>
        <Input name="from" type="date" defaultValue={params.from} aria-label="From date" />
        <Input name="to" type="date" defaultValue={params.to} aria-label="To date" />
        <Input name="q" defaultValue={params.q} placeholder="Signature or address" aria-label="Search" />
        <Button type="submit" variant="secondary">Apply</Button>
        <div className="flex items-center justify-between gap-3 text-xs text-fg-muted sm:col-span-6">
          <label className="flex items-center gap-2">
            Sort
            <Select name="sort" defaultValue={sort} className="h-8 w-auto text-xs">
              {Object.entries(sortLabel).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </label>
          <span>
            {total} movement{total === 1 ? "" : "s"}
            {lastBatch ? ` · data as of last import ${new Date(lastBatch.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.org.timezone })}` : ""}
            {" · chain sync not configured"}
          </span>
        </div>
      </form>

      {loadError ? <Notice tone="warn">{loadError}</Notice> : null}

      <Card>
        {rows.length === 0 && !loadError ? (
          <div className="px-5 py-10 text-center text-sm text-fg-muted">
            {qs ? "No movements match these filters." : "No movements yet."}{" "}
            {can(ctx, "import") && !qs ? (
              <Link href="/app/movements/import" className="font-medium text-fg underline-offset-4 hover:underline">
                Import a CSV to start.
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Entity</th>
                  <th className="px-4 py-2.5 font-medium">Counterparty</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fiat</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Review</th>
                  <th className="px-4 py-2.5 font-medium">Attention</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const reason = attentionReason(r);
                  return (
                    <tr key={r.id} className="hover:bg-surface-2/60">
                      <td className="tabular whitespace-nowrap px-4 py-2.5 font-mono text-xs text-fg-muted">
                        {new Date(r.block_time).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.org.timezone })}
                      </td>
                      <td className="px-4 py-2.5">{r.entity?.name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        {r.context?.counterparty_name ?? <span className="text-fg-subtle">Unknown</span>}
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs">
                        <span className={r.direction === "in" ? "text-ok" : ""}>{r.direction === "in" ? "+" : "−"}</span>
                        {formatTokenAmount(r.amount_raw, r.token_decimals)} <span className="text-fg-muted">{r.token_symbol ?? r.token_mint.slice(0, 4)}</span>
                      </td>
                      <td className="tabular whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-fg-muted">
                        {r.valuation ? formatFiat(r.valuation.fiat_amount, r.valuation.currency) : <span className="text-fg-subtle">No valuation</span>}
                      </td>
                      <td className="px-4 py-2.5">{r.context ? categoryLabel[r.context.category] : <span className="text-fg-subtle">—</span>}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={r.review_status === "approved" ? "ok" : r.review_status === "correction_requested" ? "warn" : "neutral"}>
                          {reviewLabel[r.review_status]}
                        </Badge>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-fg-muted" title={reason ?? ""}>
                        {reason ? <span className="text-warn">{reason}</span> : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={`/app/movements/${r.id}${backParam}`} className="inline-flex items-center gap-1 font-medium text-fg hover:underline">
                          {reason ? "Resolve" : "Open"} <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {pageCount > 1 ? (
        <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-fg-muted">Page {page} of {pageCount}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2">Previous</Link> : null}
            {page < pageCount ? <Link href={pageHref(page + 1)} className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2">Next</Link> : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
