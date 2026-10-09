"use client";

import { useActionState } from "react";
import Link from "next/link";
import { commitInvoiceImport, previewInvoiceImport } from "./actions";
import type { ImportState } from "../../movements/import/actions";
import { Badge, Button, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const initial: ImportState = { step: "upload" };

export function InvoiceImportWizard() {
  const [preview, previewAction] = useActionState<ImportState, FormData>(previewInvoiceImport, initial);
  const [done, commitAction] = useActionState<ImportState, FormData>(commitInvoiceImport, initial);

  if (done.step === "done" && done.result) {
    const r = done.result;
    return (
      <div className="space-y-3">
        <Notice tone="ok">
          Imported <strong>{done.filename}</strong>: {r.inserted} inserted · {r.duplicate} already present · {r.errors.length} rejected. Matching ran for all open movements.
        </Notice>
        {r.errors.length > 0 ? (
          <ul className="list-disc pl-5 text-sm text-warn">
            {r.errors.map((e) => (
              <li key={e.row}>Row {e.row}: {e.error}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Link href="/app/reconciliation"><Button>Review proposals</Button></Link>
          <Link href="/app/invoices"><Button variant="secondary">Invoices</Button></Link>
        </div>
      </div>
    );
  }
  if (done.error) return <Notice tone="warn">{done.error} <Link href="/app/invoices/import" className="underline">Start again.</Link></Notice>;

  if (preview.step === "preview" && preview.rows) {
    const valid = preview.rows.filter((r) => r.errors.length === 0).length;
    return (
      <div className="space-y-4">
        <p className="text-sm">
          <strong>{preview.filename}</strong>: {preview.rows.length} rows · <span className="text-ok">{valid} valid</span>
          {preview.rows.length - valid > 0 ? <> · <span className="text-warn">{preview.rows.length - valid} with errors (skipped)</span></> : null}
        </p>
        <div className="max-h-80 overflow-auto rounded-md border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2 text-left uppercase tracking-wide text-fg-muted">
              <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Ref</th><th className="px-3 py-2">Counterparty</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Issued</th><th className="px-3 py-2">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.rows.map((r) => (
                <tr key={r.n} className={r.errors.length ? "bg-warn-soft/40" : ""}>
                  <td className="px-3 py-1.5 text-fg-muted">{r.n}</td>
                  <td className="px-3 py-1.5 font-mono">{r.values.external_ref}</td>
                  <td className="px-3 py-1.5">{r.values.counterparty_name}</td>
                  <td className="px-3 py-1.5">{r.values.kind}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.values.amount} {r.values.currency}</td>
                  <td className="px-3 py-1.5 font-mono">{r.values.issued_at}</td>
                  <td className="px-3 py-1.5">{r.errors.length ? <span className="text-warn">{r.errors.join("; ")}</span> : <Badge tone="ok">ok</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={commitAction} className="flex items-center gap-2">
          <input type="hidden" name="filename" value={preview.filename} />
          <input type="hidden" name="payload" value={preview.payload} />
          <SubmitButton disabled={valid === 0} pendingText="Importing…">Import {valid} valid row{valid === 1 ? "" : "s"}</SubmitButton>
          <Link href="/app/invoices/import"><Button type="button" variant="ghost">Cancel</Button></Link>
        </form>
      </div>
    );
  }

  return (
    <form action={previewAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <input type="file" name="file" accept=".csv,text/csv" required className="text-sm file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium" />
      <SubmitButton pendingText="Validating…">Preview</SubmitButton>
      {preview.error ? <Notice tone="warn">{preview.error}</Notice> : null}
    </form>
  );
}
