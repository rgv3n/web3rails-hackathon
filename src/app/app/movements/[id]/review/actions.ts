"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";

export interface ReviewState {
  error?: string;
  conflict?: boolean;
  ok?: string;
}

async function review(action: "approve" | "return", formData: FormData): Promise<ReviewState> {
  await requireOrg();
  const supabase = await createClient();
  const movementId = String(formData.get("movement_id") ?? "");
  const expected = Number(formData.get("expected_version") ?? NaN);
  const { error } = await supabase.rpc("review_movement", { p_movement: movementId, p_action: action, p_expected_version: expected, p_reason: String(formData.get("reason") ?? "") });
  if (error) {
    const m = error.message;
    if (m.startsWith("CONFLICT")) return { conflict: true, error: m.replace(/^CONFLICT:\s*/, "") };
    if (m.startsWith("BLOCKED")) return { error: m.replace(/^BLOCKED:\s*/, "") };
    if (m.startsWith("FORBIDDEN")) return { error: "Only reviewers can approve or return records." };
    return { error: m.replace(/^(INVALID|NOT_FOUND):\s*/, "") };
  }
  for (const p of [`/app/movements/${movementId}`, "/app/movements", "/app/exceptions", "/app/exports", "/app"]) revalidatePath(p);
  return { ok: action === "approve" ? "Approved." : "Returned for correction." };
}

export async function approveMovement(_p: ReviewState, f: FormData) {
  return review("approve", f);
}
export async function returnMovement(_p: ReviewState, f: FormData) {
  return review("return", f);
}
