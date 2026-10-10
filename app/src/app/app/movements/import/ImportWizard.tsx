"use client";

import { useActionState } from "react";
import Link from "next/link";
import { commitImport, previewImport, type ImportState } from "./actions";
import { Badge, Button, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const initial: ImportState = { step: "upload" };

export function ImportWizard() {
  const [preview, previewAction] = useActionState<ImportState, FormData>(previewImport, initial);
  const [done, commitAction] = useActionState<ImportState, FormData>(commitImport, initial);

  if (done.step === "done" && done.result) {
    const r = done.result;
    return (
      <div className="space-y-3">
        <Notice tone="ok">
          Imported <strong>{done.filename}</strong>: {r.inserted} inserted · {r.duplicate} already present · {r.discrepant} differ from stored records ·{" "}
          {r.errors.length} rejected.
        </Notice>
        {r.discrepant > 0 ? <Notice tone="warn">Rows that differ from what is stored opened an exception each. Stored values were kept. Review them in Movements → Discrepancies.</Notice> : null}
        {r.errors.length > 0 ? (
          <ul className="list-disc pl-5 text-sm text-warn">
            {r.errors.map((e) => (
              <li key={e.row}>Row {e.row}: {e.error}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Link href="/app/movements"><Button>Go to movements</Button></Link>
          <Link href="/app/movements/import"><Button variant="secondary">Import another file</Button></Link>
        </div>
      </div>
    );
  }
  if (done.error) {
    return <Notice tone="warn">{done.error} <Link href="/app/movements/import" className="underline">Start again.</Link></Notice>;
  }

  if (preview.step === "preview" && preview.rows) {
    const valid = preview.rows.filter((r) => r.errors.length === 0).length;
    const invalid = preview.rows.length - valid;
    return (
      <div className="space-y-4">
        <p className="text-sm">
          <strong>{preview.filename}</strong>: {preview.rows.length} rows · <span className="text-ok">{valid} valid</span>
          {invalid > 0 ? <> · <span className="text-warn">{invalid} with errors (will be skipped)</span></> : null}
        </p>
        <div className="max-h-80 overflow-auto rounded-md border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2 text-left uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Signature</th>
                <th className="px-3 py-2">Block time</th>
                <th className="px-3 py-2 text-right">amount_raw</th>
                <th className="px-3 py-2">Token</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono">
              {preview.rows.map((r) => (
                <tr key={r.n} className={r.errors.length ? "bg-warn-soft/40" : ""}>
                  <td className="px-3 py-1.5 text-fg-muted">{r.n}</td>
                  <td className="px-3 py-1.5">{r.values.tx_signature?.slice(0, 12)}… <span className="text-fg-subtle">#{r.values.instruction_index || 0}</span></td>
                  <td className="px-3 py-1.5">{r.values.block_time}</td>
                  <td className="px-3 py-1.5 text-right">{r.values.amount_raw}</td>
                  <td className="px-3 py-1.5">{r.values.token_symbol || r.values.token_mint?.slice(0, 6)} <span className="text-fg-subtle">/{r.values.token_decimals}</span></td>
                  <td className="px-3 py-1.5 font-sans">
                    {r.errors.length ? <span className="text-warn">{r.errors.join("; ")}</span> : <Badge tone="ok">ok</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={commitAction} className="flex items-center gap-2">
          <input type="hidden" name="filename" value={preview.filename} />
          <input type="hidden" name="payload" value={preview.payload} />
          <SubmitButton disabled={valid === 0} pendingText="Importing…">
            Import {valid} valid row{valid === 1 ? "" : "s"}
          </SubmitButton>
          <Link href="/app/movements/import"><Button type="button" variant="ghost">Cancel</Button></Link>
        </form>
      </div>
    );
  }

  return (
    <form action={previewAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        required
        className="text-sm file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      <SubmitButton pendingText="Validating…">Preview</SubmitButton>
      {preview.error ? <Notice tone="warn">{preview.error}</Notice> : null}
    </form>
  );
}
