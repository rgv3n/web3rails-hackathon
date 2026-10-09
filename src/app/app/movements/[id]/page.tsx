import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { formatTokenAmount } from "@/lib/money";
import { explorerAddressUrl, explorerTxUrl, shortId } from "@/lib/solana";
import { Badge, Card, CardHeader, Notice, PageTitle } from "@/components/ui";
import { categoryLabel, getMovement, reconLabel, reviewLabel } from "../queries";
import { ContextForm } from "./ContextForm";
import { ReconciliationBlock } from "../../reconciliation/ReconciliationBlock";

export const metadata = { title: "Movement" };

function Row({ k, children, mono = false }: { k: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 px-5 py-2 text-sm">
      <dt className="text-fg-muted">{k}</dt>
      <dd className={mono ? "break-all font-mono text-xs" : ""}>{children}</dd>
    </div>
  );
}

export default async function MovementDetail(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const back = typeof sp.back === "string" ? `/app/movements?${sp.back}` : "/app/movements";
  const ctx = await requireOrg();
  const supabase = await createClient();
  const m = await getMovement(supabase, ctx.org.id, id);
  if (!m) notFound();

  const [{ data: revisions }, { data: events }, { data: discrepancies }, { data: decisions }] = await Promise.all([
    supabase
      .from("movement_context_revisions")
      .select("version, counterparty_name, purpose, category, reference, note, created_at, author:profiles!movement_context_revisions_created_by_fkey(full_name)")
      .eq("movement_id", id)
      .order("version", { ascending: false }),
    supabase
      .from("audit_events")
      .select("id, action, entity, reason, after, at, actor:profiles!audit_events_actor_profile_fkey(full_name)")
      .eq("org_id", ctx.org.id)
      .eq("entity_id", id)
      .order("at", { ascending: false }),
    supabase.from("import_discrepancies").select("field, stored_value, incoming_value, created_at").eq("movement_id", id).order("created_at", { ascending: false }),
    supabase.from("match_decisions").select("id, kind, reason, decided_at, invoice:invoices(external_ref), actor:profiles!match_decisions_actor_id_fkey(full_name)").eq("movement_id", id).order("decided_at", { ascending: false }),
  ]);

  const { data: orgRow } = await supabase.from("organizations").select("matching_tolerance").eq("id", ctx.org.id).single();
  const tolerance = String(orgRow?.matching_tolerance ?? "0.01");
  const current = (revisions ?? []).find((r) => r.version === m.context_version) ?? null;
  const txUrl = explorerTxUrl("solana", m.tx_signature);
  const tz = ctx.org.timezone;
  const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: tz });

  return (
    <>
      <Link href={back} className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Movements
      </Link>
      <PageTitle
        title={`${m.direction === "in" ? "+" : "−"}${formatTokenAmount(m.amount_raw, m.token_decimals)} ${m.token_symbol ?? ""}`.trim()}
        text={`${m.entity?.name ?? "—"} · ${m.wallet?.label ?? "—"} · ${fmt(m.block_time)}`}
        action={
          <div className="flex gap-1.5">
            <Badge>{m.identification_status === "identified" ? "Identified" : "Unidentified"}</Badge>
            <Badge>{reconLabel[m.reconciliation_status]}</Badge>
            <Badge tone={m.review_status === "approved" ? "ok" : m.review_status === "correction_requested" ? "warn" : "neutral"}>{reviewLabel[m.review_status]}</Badge>
          </div>
        }
      />

      {m.open_exceptions.length > 0 ? (
        <div className="mb-4 space-y-2">
          {m.open_exceptions.map((e) => (
            <Notice key={e.id} tone="warn">
              <span className="font-medium">{e.kind.replace(/_/g, " ")}:</span> {e.reason}
            </Notice>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1 · Blockchain movement (source, read-only) */}
        <Card>
          <CardHeader title="Blockchain movement" text={`Source: ${m.source} · ${m.source_status}`} />
          <dl className="divide-y divide-line">
            <Row k="Network">solana</Row>
            <Row k="Signature" mono>
              {m.tx_signature}
              {txUrl ? (
                <a href={txUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-accent-strong hover:underline">
                  explorer <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </Row>
            <Row k="Instruction">{m.instruction_index}</Row>
            <Row k="Block time">{fmt(m.block_time)} <span className="text-fg-subtle">({tz})</span></Row>
            <Row k="From" mono>
              <AddressLink address={m.from_address} />
            </Row>
            <Row k="To" mono>
              <AddressLink address={m.to_address} />
            </Row>
            <Row k="Token" mono>
              {m.token_symbol ?? "—"} · {m.token_mint} · {m.token_decimals} decimals
            </Row>
            <Row k="Exact amount" mono>
              {m.amount_raw} minimal units = {formatTokenAmount(m.amount_raw, m.token_decimals, { maxFraction: m.token_decimals })}
            </Row>
          </dl>
          {discrepancies && discrepancies.length > 0 ? (
            <div className="border-t border-line px-5 py-3 text-sm">
              <p className="mb-1 font-medium text-warn">Re-import differences (stored values kept)</p>
              <ul className="space-y-0.5 font-mono text-xs text-fg-muted">
                {discrepancies.map((d, i) => (
                  <li key={i}>
                    {d.field}: stored {d.stored_value} · incoming {d.incoming_value} · {fmt(d.created_at)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        {/* 2 · Financial context (versioned) */}
        <Card>
          <CardHeader
            title="Financial context"
            text={current ? `Revision ${m.context_version} · ${fmt(current.created_at)}` : "No context yet. The movement is unidentified."}
          />
          <div className="p-5">
            {can(ctx, "edit_context") ? (
              <ContextForm
                movementId={m.id}
                version={m.context_version}
                initial={{
                  counterparty_name: current?.counterparty_name ?? "",
                  purpose: current?.purpose ?? "",
                  category: current?.category ?? "unknown",
                  reference: current?.reference ?? "",
                  note: current?.note ?? "",
                }}
                approved={m.review_status === "approved"}
              />
            ) : (
              <dl className="space-y-2 text-sm">
                <div><dt className="text-fg-muted">Counterparty</dt><dd>{current?.counterparty_name ?? "Unknown"}</dd></div>
                <div><dt className="text-fg-muted">Category</dt><dd>{categoryLabel[current?.category ?? "unknown"]}</dd></div>
                <div><dt className="text-fg-muted">Purpose</dt><dd>{current?.purpose ?? "—"}</dd></div>
                <div><dt className="text-fg-muted">Reference</dt><dd>{current?.reference ?? "—"}</dd></div>
                <p className="pt-2 text-xs text-fg-subtle">Your role is read-only for financial context.</p>
              </dl>
            )}
          </div>
        </Card>

        {/* 3 · Reconciliation */}
        <Card>
          <CardHeader title="Reconciliation" text="Invoice candidates with named signals, and the recorded decision." />
          <div className="p-5">
            <ReconciliationBlock supabase={supabase} orgId={ctx.org.id} m={m} canDecide={can(ctx, "edit_context")} tolerance={tolerance} />
          </div>
        </Card>

        {/* 4 · Evidence and history */}
        <Card>
          <CardHeader title="Evidence and history" text="Every revision and audit event for this record." />
          <div className="divide-y divide-line">
            {(revisions ?? []).map((r) => {
              const author = r.author as unknown as { full_name: string | null } | null;
              return (
                <div key={r.version} className="px-5 py-3 text-sm">
                  <p className="flex items-center gap-2">
                    <span className="font-mono text-xs text-fg-muted">v{r.version}</span>
                    <span className="font-medium">{categoryLabel[r.category]}</span>
                    {r.counterparty_name ? <span>· {r.counterparty_name}</span> : null}
                    {r.version === m.context_version ? <Badge tone="accent">Current</Badge> : null}
                  </p>
                  <p className="text-xs text-fg-subtle">
                    {fmt(r.created_at)} · {author?.full_name ?? "—"}
                    {r.reference ? ` · ref ${r.reference}` : ""}
                  </p>
                </div>
              );
            })}
            {(decisions ?? []).map((d) => {
              const actor = d.actor as unknown as { full_name: string | null } | null;
              const inv = d.invoice as unknown as { external_ref: string } | null;
              return (
                <div key={d.id} className="px-5 py-3 text-sm">
                  <p>
                    <span className="font-medium">match</span> <span className="text-fg-muted">{d.kind.replace("_", " ")}</span>
                    {inv ? <span className="font-mono text-xs"> {inv.external_ref}</span> : null}
                    {d.reason ? <span className="text-fg-muted"> · “{d.reason}”</span> : null}
                  </p>
                  <p className="text-xs text-fg-subtle">{fmt(d.decided_at)} · {actor?.full_name ?? "—"}</p>
                </div>
              );
            })}
            {(events ?? []).map((e) => {
              const actor = e.actor as unknown as { full_name: string | null } | null;
              return (
                <div key={e.id} className="px-5 py-3 text-sm">
                  <p>
                    <span className="font-medium">{e.entity}</span> <span className="text-fg-muted">{e.action}</span>
                    {e.reason ? <span className="text-fg-muted"> · “{e.reason}”</span> : null}
                  </p>
                  <p className="text-xs text-fg-subtle">{fmt(e.at)} · {actor?.full_name ?? "system"}</p>
                </div>
              );
            })}
            {(revisions ?? []).length === 0 && (events ?? []).length === 0 ? <p className="px-5 py-4 text-sm text-fg-muted">No history yet.</p> : null}
          </div>
        </Card>
      </div>
    </>
  );
}

function AddressLink({ address }: { address: string }) {
  const url = explorerAddressUrl("solana", address);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="hover:underline" title={address}>
      {address}
    </a>
  ) : (
    <span title={address}>{shortId(address)}</span>
  );
}
