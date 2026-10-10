"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can, requireOrg } from "@/lib/org";

export interface AccountState {
  error?: string;
  saved?: "profile" | "organization" | "matching";
}

export async function updateProfile(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const job_title = String(formData.get("job_title") ?? "").trim() || null;
  if (!full_name) return { error: "Name is required." };
  const { error } = await supabase.from("profiles").update({ full_name, job_title }).eq("id", ctx.userId);
  if (error) return { error: error.message };
  revalidatePath("/app/account");
  return { saved: "profile" };
}

export async function updateOrganization(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const ctx = await requireOrg();
  if (!can(ctx, "manage_org")) return { error: "Only admins can change organization settings." };
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const base_currency = String(formData.get("base_currency") ?? "EUR");
  const timezone = String(formData.get("timezone") ?? "Europe/Madrid");
  if (name.length < 2) return { error: "Organization name is required." };
  if (!["EUR", "USD"].includes(base_currency)) return { error: "Unsupported base currency." };

  const { error } = await supabase.from("organizations").update({ name, base_currency, timezone }).eq("id", ctx.org.id);
  if (error) return { error: error.message };
  await supabase.from("audit_events").insert({
    org_id: ctx.org.id,
    actor_id: ctx.userId,
    entity: "organization",
    entity_id: ctx.org.id,
    action: "updated",
    before: { name: ctx.org.name, base_currency: ctx.org.base_currency, timezone: ctx.org.timezone },
    after: { name, base_currency, timezone },
  });
  revalidatePath("/app", "layout");
  return { saved: "organization" };
}

export async function updateMatchingSettings(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const ctx = await requireOrg();
  if (!can(ctx, "manage_org")) return { error: "Only admins can change matching settings." };
  const tolerance = String(formData.get("matching_tolerance") ?? "").trim();
  const windowDays = Number(formData.get("matching_date_window_days") ?? NaN);
  if (!/^\d+(\.\d{1,8})?$/.test(tolerance)) return { error: "Tolerance must be a non-negative decimal in token units (e.g. 0.01)." };
  if (!Number.isInteger(windowDays) || windowDays < 0) return { error: "Date window must be a whole number of days." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_matching_settings", {
    p_org: ctx.org.id,
    p_tolerance: tolerance,
    p_window_days: windowDays,
    p_allow_self_approval: formData.get("allow_self_approval") === "on",
  });
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  return { saved: "matching" };
}
