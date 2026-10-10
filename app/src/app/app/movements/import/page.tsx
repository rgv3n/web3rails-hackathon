import Link from "next/link";
import { redirect } from "next/navigation";
import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, Notice, PageTitle } from "@/components/ui";
import { ImportWizard } from "./ImportWizard";

export const metadata = { title: "Import movements" };

export default async function ImportPage() {
  const ctx = await requireOrg();
  if (!can(ctx, "import")) redirect("/app/movements");
  const supabase = await createClient();
  const [{ count: walletCount }, { data: batches }] = await Promise.all([
    supabase.from("wallets").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("status", "active"),
    supabase
      .from("import_batches")
      .select("id, filename, source, rows_total, rows_inserted, rows_duplicate, rows_discrepant, rows_error, created_at")
      .eq("org_id", ctx.org.id)
      .eq("kind", "movements")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <>
      <PageTitle title="Import movements" text="Explicit CSV import with validation. Re-importing the same rows never duplicates; differences are flagged, not overwritten." />
      {ctx.org.is_demo ? <div className="mb-4"><Notice tone="warn">Demo organization: imported rows are stored as demo data and labelled as such.</Notice></div> : null}
      {(walletCount ?? 0) === 0 ? (
        <div className="mb-4">
          <Notice tone="warn">
            No declared wallets yet. Rows are only accepted when one side is a wallet of this organization.{" "}
            <Link href="/app/organization" className="font-medium underline-offset-4 hover:underline">Declare a wallet first.</Link>
          </Notice>
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="CSV file"
          text="Columns: tx_signature, block_time, from_address, to_address, token_mint, token_decimals, amount_raw (integer, minimal units); optional instruction_index, token_symbol, source_status, source_ref."
        />
        <div className="p-5">
          <ImportWizard />
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Recent imports" />
        {batches && batches.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-fg-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 font-medium">When</th>
                <th className="px-5 py-2.5 font-medium">File</th>
                <th className="px-5 py-2.5 text-right font-medium">Rows</th>
                <th className="px-5 py-2.5 text-right font-medium">Inserted</th>
                <th className="px-5 py-2.5 text-right font-medium">Duplicate</th>
                <th className="px-5 py-2.5 text-right font-medium">Differs</th>
                <th className="px-5 py-2.5 text-right font-medium">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular">
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="px-5 py-2 font-mono text-xs text-fg-muted">{new Date(b.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="px-5 py-2">{b.filename} <span className="text-fg-subtle">· {b.source}</span></td>
                  <td className="px-5 py-2 text-right font-mono text-xs">{b.rows_total}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs">{b.rows_inserted}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs">{b.rows_duplicate}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs">{b.rows_discrepant}</td>
                  <td className="px-5 py-2 text-right font-mono text-xs">{b.rows_error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-4 text-sm text-fg-muted">No imports yet. A labelled sample lives in the repo at docs/samples/movements.sample.csv.</p>
        )}
      </Card>
    </>
  );
}
