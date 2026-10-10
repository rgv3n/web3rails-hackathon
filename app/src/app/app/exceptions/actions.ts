"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";

export interface ExceptionState {
  error?: string;
  ok?: string;
}

export async function updateException(_p: ExceptionState, formData: FormData): Promise<ExceptionState> {
  await requireOrg();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "open");
  const assignee = String(formData.get("assignee_id") ?? "") || null;
  const { error } = await supabase.rpc("update_exception", {
    p_id: id,
    p_status: status,
    p_assignee: assignee,
    p_comment: String(formData.get("comment") ?? ""),
    p_resolution: String(formData.get("resolution") ?? ""),
  });
  if (error) return { error: error.message.replace(/^(INVALID|FORBIDDEN|NOT_FOUND):\s*/, "") };
  for (const p of ["/app/exceptions", "/app/movements", "/app"]) revalidatePath(p);
  return { ok: status === "resolved" ? "Resolved." : status === "waiting" ? "Marked as waiting." : "Saved." };
}
