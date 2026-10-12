"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can, requireOrg } from "@/lib/org";
import { isSolanaAddress } from "@/lib/solana";

export interface OrgAdminState {
  error?: string;
  ok?: string;
}

export async function createEntity(_p: OrgAdminState, formData: FormData): Promise<OrgAdminState> {
  const ctx = await requireOrg();
  if (!can(ctx, "manage_org")) return { error: "Only admins can manage entities." };
  const name = String(formData.get("name") ?? "").trim();
  const reporting_currency = String(formData.get("reporting_currency") ?? "EUR");
  const tax_id = String(formData.get("tax_id") ?? "").trim().toUpperCase().replace(/[\s-]/g, "") || null;
  const subject_type = String(formData.get("subject_type") ?? "legal_entity");
  if (name.length < 2) return { error: "Entity name is required." };
  if (!["EUR", "USD"].includes(reporting_currency)) return { error: "Unsupported currency." };
  if (!["legal_entity", "natural_person"].includes(subject_type)) return { error: "Unsupported entity type." };
  if (tax_id && !/^[A-Z0-9]{5,20}$/.test(tax_id)) return { error: "Tax id: letters and digits only, 5 to 20 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("legal_entities").insert({ org_id: ctx.org.id, name, reporting_currency, tax_id, subject_type }).select("id").single();
  if (error) return { error: error.message };
  await supabase.from("audit_events").insert({ org_id: ctx.org.id, actor_id: ctx.userId, entity: "legal_entity", entity_id: data.id, action: "created", after: { name, reporting_currency, tax_id, subject_type } });
  revalidatePath("/app/organization");
  return { ok: `Entity “${name}” created.` };
}

export async function createWallet(_p: OrgAdminState, formData: FormData): Promise<OrgAdminState> {
  const ctx = await requireOrg();
  if (!can(ctx, "manage_org")) return { error: "Only admins can declare wallets." };
  const entity_id = String(formData.get("entity_id") ?? "");
  const address = String(formData.get("address") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const ownership_evidence = String(formData.get("ownership_evidence") ?? "").trim() || null;
  if (!entity_id) return { error: "Choose the legal entity that owns the wallet." };
  if (!isSolanaAddress(address)) return { error: "Not a valid Solana address (base58, 32–44 chars)." };
  if (!label) return { error: "Give the wallet a label." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wallets")
    .insert({ org_id: ctx.org.id, entity_id, chain: "solana", address, label, ownership: "declared", ownership_evidence, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "This address is already declared in your organization." : error.message };
  await supabase.from("audit_events").insert({ org_id: ctx.org.id, actor_id: ctx.userId, entity: "wallet", entity_id: data.id, action: "declared", after: { address, label, entity_id, ownership: "declared" } });
  revalidatePath("/app/organization");
  revalidatePath("/app/movements/import");
  return { ok: `Wallet “${label}” declared. Ownership is declared, not verified.` };
}

export async function archiveWallet(formData: FormData) {
  const ctx = await requireOrg();
  if (!can(ctx, "manage_org")) return;
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data } = await supabase.from("wallets").update({ status: "archived" }).eq("id", id).eq("org_id", ctx.org.id).select("label").maybeSingle();
  if (data) await supabase.from("audit_events").insert({ org_id: ctx.org.id, actor_id: ctx.userId, entity: "wallet", entity_id: id, action: "archived", before: { label: data.label } });
  revalidatePath("/app/organization");
}
