import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rowsToCsv, sha256 } from "@/lib/export-csv";

/** Serves the CSV regenerated from the frozen snapshot rows. RLS limits it to the member's organization. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: exp } = await supabase.from("exports").select("id, period_from, period_to, checksum_sha256, org_id").eq("id", id).maybeSingle();
  if (!exp) return new NextResponse("Not found", { status: 404 });
  const { data: items } = await supabase.from("export_items").select("row").eq("export_id", id).order("movement_id");
  const csv = rowsToCsv((items ?? []).map((i) => i.row as Record<string, unknown>));
  const digest = sha256(csv);
  // Record the download in the audit log (who pulled which snapshot).
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("audit_events").insert({ org_id: exp.org_id, actor_id: user?.id ?? null, entity: "export", entity_id: id, action: "downloaded", after: { checksum_sha256: digest, matches_recorded: exp.checksum_sha256 === digest } });
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="web3rails-export-${exp.period_from}_${exp.period_to}-${id.slice(0, 8)}.csv"`,
      "X-Checksum-SHA256": digest,
      "X-Checksum-Matches-Recorded": String(exp.checksum_sha256 === digest),
      "Cache-Control": "private, no-store",
    },
  });
}
