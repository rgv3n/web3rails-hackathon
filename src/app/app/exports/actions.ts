"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { rowsToCsv, sha256 } from "@/lib/export-csv";

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
