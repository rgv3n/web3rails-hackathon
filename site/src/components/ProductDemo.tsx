"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Check, CircleDashed, Loader2, Minus, X } from "lucide-react";
import {
  auditExamples,
  directionLabel,
  exceptions,
  productMetrics,
  records as seed,
  type Direction,
  type EvidenceKind,
  type ReconRecord,
  type ReconStatus,
} from "@/lib/product-data";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                          */
/* ------------------------------------------------------------------ */

function StatusPill({ status }: { status: ReconStatus }) {
  if (status === "reconciled") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm bg-ok-soft px-1.5 py-0.5 text-xs font-medium text-ok">
        <Check className="size-3" aria-hidden />
        Reconciled
      </span>
    );
  }
  if (status === "review") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">
        <CircleDashed className="size-3" aria-hidden />
        Needs review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg-muted">
      <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden />
      Matching
    </span>
  );
}

function DirectionMark({ direction }: { direction: Direction }) {
  const Icon = direction === "in" ? ArrowDownLeft : direction === "out" ? ArrowUpRight : ArrowRightLeft;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      <Icon className="size-3.5 text-fg-subtle" aria-hidden />
      {directionLabel[direction]}
    </span>
  );
}

function Confidence({ value }: { value: number }) {
  const tone = value >= 90 ? "bg-ok" : value >= 75 ? "bg-accent" : "bg-warn";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1 w-10 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </span>
      <span className="font-mono text-xs text-fg-muted tabular">{(value / 100).toFixed(2)}</span>
    </span>
  );
}

function EvidenceIcon({ kind }: { kind: EvidenceKind }) {
  if (kind === "strong") return <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-label="Strong evidence" />;
  if (kind === "supporting") return <Minus className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-label="Supporting evidence" />;
  return <X className="mt-0.5 size-3.5 shrink-0 text-warn" aria-label="Missing" />;
}

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd className={cn("mt-0.5 text-sm text-fg [overflow-wrap:anywhere]", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

function PanelTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">{children}</h3>
      {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View 1 · Reconciliation queue                                        */
/* ------------------------------------------------------------------ */

const headers: { label: string; align?: "right"; w: string }[] = [
  { label: "Transaction", w: "15%" },
  { label: "Counterparty · entity", w: "17%" },
  { label: "Amount", align: "right", w: "10%" },
  { label: "Fiat value", align: "right", w: "9%" },
  { label: "Invoice", w: "12%" },
  { label: "Classification", w: "19%" },
  { label: "Confidence", w: "8%" },
  { label: "Status", w: "10%" },
];

function QueueView({
  rows,
  selectedId,
  onSelect,
  onOpenAudit,
}: {
  rows: ReconRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenAudit: () => void;
}) {
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];
  return (
    <div>
      <dl className="grid grid-cols-2 border-b border-line sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-line">
        {productMetrics.map((m) => (
          <div key={m.label} className="px-5 py-4">
            <dt className="text-xs text-fg-subtle">{m.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-fg tabular">{m.value}</dd>
            <dd className="mt-0.5 font-mono text-[11px] text-fg-subtle">{m.hint}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed text-left text-[13px]">
          <caption className="sr-only">Illustrative reconciliation queue. Select a transaction to see its summary.</caption>
          <colgroup>
            {headers.map((h) => (
              <col key={h.label} style={{ width: h.w }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-line bg-surface-2/50 text-[11px] uppercase tracking-wider text-fg-subtle">
              {headers.map((h) => (
                <th key={h.label} scope="col" className={cn("whitespace-nowrap px-3 py-2.5 font-medium first:pl-5 last:pr-5", h.align === "right" && "text-right")}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const active = r.id === selectedId;
              return (
                <tr key={r.id} className={cn("transition-colors", active ? "bg-accent-soft/60" : "hover:bg-surface-2/60")}>
                  <td className="px-3 py-3 pl-5 align-top">
                    <button
                      type="button"
                      onClick={() => onSelect(r.id)}
                      aria-pressed={active}
                      aria-label={`Select transaction ${r.hash}`}
                      className="-mx-1.5 -my-1 block w-full rounded-sm px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <span className="block truncate font-mono text-xs text-fg">{r.hash.slice(0, 8)}…{r.hash.slice(-4)}</span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-fg-subtle tabular">{r.timestamp.replace(" UTC", "")}</span>
                      <span className="mt-1 block">
                        <DirectionMark direction={r.direction} />
                        <span className="ml-1.5 font-mono text-[11px] text-fg-subtle">· {r.network}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className={cn("block font-medium leading-snug", r.counterparty ? "text-fg" : "italic text-fg-muted")}>
                      {r.counterparty ?? "Unknown counterparty"}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-fg-subtle">{r.entity}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right align-top font-mono text-xs text-fg tabular">
                    {r.amount}
                    <span className="block text-[11px] text-fg-subtle">{r.asset}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right align-top font-mono text-xs text-fg-muted tabular">{r.fiat.value}</td>
                  <td className="px-3 py-3 align-top font-mono text-xs text-fg-muted">
                    {r.invoice ? (
                      <>
                        <span className="block">{r.invoice.replace(" (partial)", "")}</span>
                        {r.invoice.includes("partial") && <span className="block text-[11px] text-fg-subtle">partial</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className="block leading-snug text-fg">{r.purpose}</span>
                    <span className={cn("mt-0.5 block text-[11px] leading-snug", r.escalation ? "text-warn" : "text-fg-subtle")}>
                      {r.escalation ? r.escalation.reason.split(".")[0] : r.classification}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-top">
                    <Confidence value={r.confidence} />
                  </td>
                  <td className="px-3 py-3 pr-5 align-top">
                    <StatusPill status={r.status} />
                    <span className="mt-1 block text-[11px] text-fg-subtle">{r.reviewer ?? "Automatic"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* selected record summary */}
      <div className="grid gap-5 border-t border-line bg-surface-2/40 px-5 py-5 lg:grid-cols-12" aria-live="polite">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-8 lg:grid-cols-4">
          <Field label="Transaction" value={selected.hash} mono />
          <Field label="Wallet" value={`${selected.wallet.label} · ${selected.wallet.address}`} mono />
          <Field label="Counterparty wallet" value={`${selected.counterpartyWallet.label} · ${selected.counterpartyWallet.address}`} mono />
          <Field label="Fiat rate" value={`${selected.fiat.rate} · ${selected.fiat.source}`} mono />
          <Field label="Economic purpose" value={selected.purpose} />
          <Field label="Accounting classification" value={selected.classification} />
          <Field label="Decided by" value={selected.decidedBy} mono />
          <Field label="Decided at" value={selected.decidedAt} mono />
        </dl>
        <div className="flex flex-col justify-between gap-3 lg:col-span-4 lg:items-end">
          <p className="text-xs leading-relaxed text-fg-muted lg:text-right">
            {selected.evidence.filter((e) => e.kind !== "missing").length} pieces of evidence ·{" "}
            {selected.evidence.filter((e) => e.kind === "missing").length} missing
          </p>
          <button
            type="button"
            onClick={onOpenAudit}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Open audit trail
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View 2 · Exception queue                                             */
/* ------------------------------------------------------------------ */

function ExceptionsView({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const current = exceptions.find((e) => e.id === selectedId) ?? exceptions[0];
  return (
    <div className="grid lg:grid-cols-12">
      <div className="border-b border-line lg:col-span-4 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-5 py-3">
          <PanelTitle>Exception queue</PanelTitle>
          <span className="font-mono text-[11px] text-fg-subtle tabular">{exceptions.length} shown of 87</span>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {exceptions.map((e) => {
            const active = e.id === current.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e.id)}
                  aria-pressed={active}
                  className={cn(
                    "block w-full px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                    active ? "bg-accent-soft/60" : "hover:bg-surface-2/60",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-xs text-fg tabular">
                      {e.amount} {e.asset}
                    </span>
                    <span className="font-mono text-[11px] text-fg-subtle tabular">{e.timestamp.slice(0, 16)}</span>
                  </div>
                  <p className={cn("mt-1 text-sm font-medium", e.counterparty ? "text-fg" : "italic text-fg-muted")}>
                    {e.counterparty ?? "Unknown counterparty"}
                  </p>
                  <p className="mt-0.5 text-xs text-warn">{e.escalation?.reason.split(".")[0]}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <Confidence value={e.confidence} />
                    <span className="text-[11px] text-fg-subtle">{e.reviewer}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="lg:col-span-8" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-fg">{current.hash}</span>
            <StatusPill status={current.status} />
          </div>
          <span className="font-mono text-[11px] text-fg-subtle">{current.timestamp}</span>
        </div>

        <div className="grid gap-6 px-5 py-5 md:grid-cols-2">
          <section>
            <PanelTitle>Why it was escalated</PanelTitle>
            <p className="mt-2 text-sm leading-relaxed text-fg">{current.escalation?.reason}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Amount" value={`${current.amount} ${current.asset} · ${current.fiat.value}`} mono />
              <Field label="Direction" value={<DirectionMark direction={current.direction} />} />
              <Field label="Our wallet" value={`${current.wallet.label} · ${current.wallet.address}`} mono />
              <Field label="Counterparty wallet" value={`${current.counterpartyWallet.label} · ${current.counterpartyWallet.address}`} mono />
              <Field label="Entity" value={current.entity} />
              <Field label="Escalation rule" value={current.decidedBy} mono />
            </dl>
          </section>

          <section>
            <PanelTitle>What is missing</PanelTitle>
            <ul className="mt-2 space-y-1.5">
              {current.escalation?.missing.map((m) => (
                <li key={m} className="flex items-start gap-2 text-sm text-fg">
                  <X className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
                  {m}
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <PanelTitle>Decision required</PanelTitle>
              <p className="mt-2 text-sm leading-relaxed text-fg">{current.escalation?.decision}</p>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Available actions (demo)">
                {current.escalation?.options.map((o) => (
                  <li key={o} className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-fg">
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <section className="border-t border-line px-5 py-5">
          <PanelTitle hint="strong · supporting · missing">Evidence on file</PanelTitle>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {current.evidence.map((e) => (
              <li key={e.text} className="flex items-start gap-2.5 rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-fg-muted">
                <EvidenceIcon kind={e.kind} />
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2/40 px-5 py-3 text-xs text-fg-subtle">
          <span>Provisional posting: {current.accounting.treatment}</span>
          <span className="font-mono">reviewer: {current.reviewer}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View 3 · Audit trail                                                 */
/* ------------------------------------------------------------------ */

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="relative pl-10">
      <span className="absolute top-0 left-0 flex size-6 items-center justify-center rounded-full border border-line-strong bg-surface font-mono text-[10px] text-fg tabular" aria-hidden>
        {n}
      </span>
      <h4 className="pt-0.5 text-sm font-semibold text-fg">{title}</h4>
      <div className="mt-3 pb-8">{children}</div>
    </li>
  );
}

function AuditView({ rows, selectedId, onSelect }: { rows: ReconRecord[]; selectedId: string; onSelect: (id: string) => void }) {
  const r = rows.find((x) => x.id === selectedId) ?? rows[0];
  const groupId = useId();
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div role="group" aria-labelledby={groupId} className="flex flex-wrap gap-1">
          <span id={groupId} className="sr-only">Example record</span>
          {auditExamples.map((ex) => {
            const active = ex.id === r.id;
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => onSelect(ex.id)}
                aria-pressed={active}
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active ? "bg-fg text-bg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {ex.label}
              </button>
            );
          })}
        </div>
        <span className="font-mono text-xs text-fg-subtle">{r.id}</span>
      </div>

      <div className="grid gap-8 px-5 py-6 lg:grid-cols-12">
        <ol className="relative lg:col-span-8" aria-live="polite">
          <span className="absolute top-3 bottom-8 left-3 w-px bg-line-strong" aria-hidden />

          <Step n="1" title="Source transaction">
            <dl className="grid grid-cols-2 gap-3 rounded-md border border-ink-line bg-ink p-4 sm:grid-cols-3 [&_dd]:text-ink-fg [&_dt]:text-ink-muted">
              <Field label="Hash" value={r.hash} mono />
              <Field label="Network · slot" value={`${r.network} · ${r.slot}`} mono />
              <Field label="Block time" value={r.timestamp} mono />
              <Field label="From" value={`${r.direction === "in" ? r.counterpartyWallet.address : r.wallet.address}`} mono />
              <Field label="To" value={`${r.direction === "in" ? r.wallet.address : r.counterpartyWallet.address}`} mono />
              <Field label="Amount" value={`${r.amount} ${r.asset}`} mono />
            </dl>
            <p className="mt-2 text-xs text-fg-subtle">What the chain records. Proof that value moved, nothing more.</p>
          </Step>

          <Step n="2" title="Matching evidence">
            <ul className="space-y-2">
              {r.evidence.map((e) => (
                <li key={e.text} className="flex items-start gap-2.5 text-sm text-fg-muted">
                  <EvidenceIcon kind={e.kind} />
                  <span>{e.text}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Direction" value={<DirectionMark direction={r.direction} />} />
              <Field label="Wallet" value={r.wallet.label} mono />
              <Field label="Counterparty" value={r.counterparty ?? "Unresolved"} />
              <Field label="Entity" value={r.entity} />
            </dl>
          </Step>

          <Step n="3" title="Classification decision">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Economic purpose" value={r.purpose} />
              <Field label="Accounting classification" value={r.classification} />
              <Field label="Confidence" value={<Confidence value={r.confidence} />} />
              <Field label="Decided by" value={r.decidedBy} mono />
              <Field label="Decided at" value={r.decidedAt} mono />
              <Field label="Reviewer" value={r.reviewer ?? "None required"} />
            </dl>
            <p className="mt-3 text-xs text-fg-subtle">
              {r.status === "review"
                ? "Held for a human decision. The provisional posting below is reversed when the reviewer decides."
                : "Automatic decision. Reviewable and reversible; reopening creates a new decision, never overwrites this one."}
            </p>
          </Step>

          <Step n="4" title="Accounting record">
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[520px] text-left text-sm">
                <caption className="sr-only">Journal lines for the selected record</caption>
                <thead>
                  <tr className="border-b border-line bg-surface-2/50 text-[11px] uppercase tracking-wider text-fg-subtle">
                    <th scope="col" className="px-3 py-2 font-medium">Account</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Debit</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.accounting.lines.map((l) => (
                    <tr key={l.account}>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-fg">{l.account}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-fg tabular">{l.debit ?? ""}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-fg tabular">{l.credit ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Treatment" value={r.accounting.treatment} />
              <Field label="Period" value={r.accounting.period} mono />
              <Field label="Fiat basis" value={`${r.fiat.rate} · ${r.fiat.source} · ${r.fiat.time}`} mono />
              <Field label="Export batch" value={r.accounting.exportBatch ?? "Not exported (pending)"} mono />
            </dl>
          </Step>
        </ol>

        <aside className="lg:col-span-4">
          <div className="rounded-md border border-line bg-surface-2/50 p-5">
            <PanelTitle>Record</PanelTitle>
            <dl className="mt-3 space-y-3">
              <Field label="Reconciliation status" value={<StatusPill status={r.status} />} />
              <Field label="Invoice" value={r.invoice ?? "None identified"} mono />
              <Field label="Fiat value at settlement" value={r.fiat.value} mono />
              <Field label="Evidence" value={`${r.evidence.filter((e) => e.kind !== "missing").length} on file · ${r.evidence.filter((e) => e.kind === "missing").length} missing`} />
            </dl>
            <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-fg-muted">
              Every field above keeps a pointer to its origin: the chain, an invoice, a registry entry, a rule or a
              person. An auditor can replay the decision without Web3Rails present.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                                */
/* ------------------------------------------------------------------ */

type View = "queue" | "exceptions" | "audit";

const views: { id: View; label: string; count?: string }[] = [
  { id: "queue", label: "Reconciliation queue", count: "1,284" },
  { id: "exceptions", label: "Exceptions", count: "87" },
  { id: "audit", label: "Audit trail" },
];

export function ProductDemo() {
  const [rows, setRows] = useState(seed);
  // Deep link: /?view=exceptions#reconciliation opens a specific view. Read from the URL without
  // setting state inside an effect; the user's own choice (chosen) always wins once they click.
  const urlView = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("view"),
    () => null,
  );
  const [chosen, setView] = useState<View | null>(null);
  const view: View = chosen ?? (urlView === "exceptions" || urlView === "audit" ? urlView : "queue");
  const [selectedId, setSelectedId] = useState(seed[0].id);
  const [exceptionId, setExceptionId] = useState(exceptions[0].id);
  const tabsId = useId();

  // One-shot demo motion: the "matching" row settles into "reconciled" shortly after mount.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settle = () => setRows((r) => r.map((x) => (x.status === "processing" ? { ...x, status: "reconciled" } : x)));
    const t = window.setTimeout(settle, reduce ? 0 : 2200);
    return () => window.clearTimeout(t);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = views.findIndex((v) => v.id === view);
    if (e.key === "ArrowRight") setView(views[(idx + 1) % views.length].id);
    if (e.key === "ArrowLeft") setView(views[(idx - 1 + views.length) % views.length].id);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_2px_rgba(15,20,24,0.04),0_12px_40px_-24px_rgba(15,20,24,0.25)]">
      {/* window chrome */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-fg">Web3Rails</span>
          <span className="hidden font-mono text-xs text-fg-subtle sm:inline">demo-co / solana-mainnet / 3 wallets / 2 entities</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-fg-subtle">
          <span className="rounded-sm border border-line px-2 py-1">1–21 Sep 2026</span>
          <span className="rounded-sm border border-line px-2 py-1">EUR</span>
        </div>
      </div>

      {/* view tabs */}
      <div role="tablist" aria-label="Product views" onKeyDown={onKeyDown} className="flex items-center gap-1 overflow-x-auto border-b border-line px-3">
        {views.map((v) => {
          const active = v.id === view;
          return (
            <button
              key={v.id}
              id={`${tabsId}-${v.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`${tabsId}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => setView(v.id)}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2 border-b-2 px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                active ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              {v.label}
              {v.count && <span className="font-mono text-[11px] text-fg-subtle tabular">{v.count}</span>}
            </button>
          );
        })}
      </div>

      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${view}`}>
        {view === "queue" && (
          <QueueView
            rows={rows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpenAudit={() => setView("audit")}
          />
        )}
        {view === "exceptions" && <ExceptionsView selectedId={exceptionId} onSelect={setExceptionId} />}
        {view === "audit" && <AuditView rows={rows} selectedId={selectedId} onSelect={setSelectedId} />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs text-fg-subtle">
        <span>Demo dataset · 7 of 1,284 records shown · no real entities, wallets or volumes</span>
        <span className="font-mono">every field keeps a pointer to its origin</span>
      </div>
    </div>
  );
}
