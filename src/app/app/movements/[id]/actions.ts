"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";

export interface ContextState {
  error?: string;
  conflict?: boolean;
  savedVersion?: number;
}

export async function saveContext(_prev: ContextState, formData: FormData): Promise<ContextState> {
  await requireOrg();
  const supabase = await createClient();
  const movementId = String(formData.get("movement_id") ?? "");
  const expected = Number(formData.get("expected_version") ?? NaN);
  if (!movementId || Number.isNaN(expected)) return { error: "Missing movement or version." };

  const { data, error } = await supabase.rpc("save_movement_context", {
    p_movement: movementId,
    p_expected_version: expected,
    p_counterparty_name: String(formData.get("counterparty_name") ?? ""),
    p_purpose: String(formData.get("purpose") ?? ""),
    p_category: String(formData.get("category") ?? "unknown"),
    p_reference: String(formData.get("reference") ?? ""),
    p_note: String(formData.get("note") ?? ""),
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error) {
    if (error.message.startsWith("CONFLICT")) return { conflict: true, error: error.message.replace(/^CONFLICT:\s*/, "") };
    if (error.message.startsWith("FORBIDDEN")) return { error: "Your role cannot edit financial context." };
    return { error: error.message };
  }
  revalidatePath(`/app/movements/${movementId}`);
  revalidatePath("/app/movements");
  return { savedVersion: data as number };
}
