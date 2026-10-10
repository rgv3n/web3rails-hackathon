"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";

export interface DecisionState {
  error?: string;
  conflict?: boolean;
  ok?: string;
}

function mapError(message: string): DecisionState {
  if (message.startsWith("CONFLICT")) return { conflict: true, error: message.replace(/^CONFLICT:\s*/, "") };
  if (message.startsWith("FORBIDDEN")) return { error: "Your role cannot decide matches." };
  if (message.startsWith("INVALID")) return { error: message.replace(/^INVALID:\s*/, "") };
  if (message.startsWith("NOT_FOUND")) return { error: "Record not found in your organization." };
  return { error: message };
}

async function decide(kind: "accept" | "manual_link" | "reject" | "unlink", formData: FormData): Promise<DecisionState> {
  await requireOrg();
  const supabase = await createClient();
  const movementId = String(formData.get("movement_id") ?? "");
  const invoiceId = String(formData.get("invoice_id") ?? "") || null;
  const expected = Number(formData.get("expected_version") ?? NaN);
  if (!movementId || Number.isNaN(expected)) return { error: "Missing movement or version." };
  const { error } = await supabase.rpc("decide_match", {
    p_movement: movementId,
    p_invoice: invoiceId,
    p_kind: kind,
    p_expected_version: expected,
    p_reason: String(formData.get("reason") ?? ""),
    p_learn_address: formData.get("learn_address") === "on",
  });
  if (error) return mapError(error.message);
  for (const p of ["/app/reconciliation", "/app/movements", `/app/movements/${movementId}`, "/app/invoices", "/app/exceptions", "/app"]) revalidatePath(p);
  return { ok: { accept: "Match accepted.", manual_link: "Invoice linked.", reject: "Candidate rejected.", unlink: "Invoice unlinked; matching re-ran." }[kind] };
}

export async function acceptMatch(_p: DecisionState, f: FormData) {
  return decide("accept", f);
}
export async function manualLink(_p: DecisionState, f: FormData) {
  return decide("manual_link", f);
}
export async function rejectMatch(_p: DecisionState, f: FormData) {
  return decide("reject", f);
}
export async function unlinkMatch(_p: DecisionState, f: FormData) {
  return decide("unlink", f);
}

export async function rerunMatching() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  await supabase.rpc("run_matching", { p_org: ctx.org.id, p_movement: null });
  revalidatePath("/app/reconciliation");
}
