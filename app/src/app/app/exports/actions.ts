"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { rowsToCsv, sha256 } from "@/lib/export-csv";
import { anchorConfigured, anchorMemo, exportMemo } from "@/lib/solana-anchor";

export interface ExportState {
  error?: string;
  ok?: string;
  id?: string;
}

export async function createExport(_p: ExportState, formData: FormData): Promise<ExportState> {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const entity = String(formData.get("entity_id") ?? "") || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { error: "Choose a period." };
  const { data: id, error } = await supabase.rpc("create_export", { p_org: ctx.org.id, p_from: from, p_to: to, p_entity: entity });
  if (error) return { error: error.message.replace(/^(FORBIDDEN|INVALID):\s*/, "") };
  // Freeze the checksum of the file as it will be served.
  const { data: items } = await supabase.from("export_items").select("row").eq("export_id", id as string).order("movement_id");
  const csv = rowsToCsv((items ?? []).map((i) => i.row as Record<string, unknown>));
  await supabase.rpc("set_export_checksum", { p_export: id as string, p_checksum: sha256(csv) });
  revalidatePath("/app/exports");
  return { ok: `Export created with ${items?.length ?? 0} approved record${items?.length === 1 ? "" : "s"}.`, id: id as string };
}

export interface AnchorState { error?: string; ok?: string }

/** Anchors the export checksum on Solana as a memo transaction and records the signature. Admin or reviewer. */
export async function anchorExport(_p: AnchorState, formData: FormData): Promise<AnchorState> {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  if (!anchorConfigured()) return { error: "Anchoring is not configured on this server (SOLANA_ANCHOR_SECRET_KEY)." };
  const { data: e } = await supabase.from("exports").select("id, checksum_sha256, anchor_signature").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (!e) return { error: "Export not found." };
  if (!e.checksum_sha256) return { error: "This export has no checksum." };
  if (e.anchor_signature) return { error: "Already anchored." };
  const memo = exportMemo(e.id, e.checksum_sha256);
  let result: Awaited<ReturnType<typeof anchorMemo>>;
  try {
    result = await anchorMemo(memo);
  } catch (err) {
    return { error: `Solana: ${(err as Error).message}` };
  }
  const { error } = await supabase.rpc("record_export_anchor", { p_export: e.id, p_cluster: result.cluster, p_signature: result.signature, p_memo: memo });
  if (error) return { error: `${error.message} (transaction ${result.signature} was sent)` };
  revalidatePath("/app/exports");
  return { ok: `Anchored on Solana ${result.cluster}: ${result.signature.slice(0, 12)}…` };
}
