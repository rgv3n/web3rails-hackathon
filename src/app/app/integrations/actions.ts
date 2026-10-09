"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { generateApiKey } from "@/lib/api-keys";
import { findIntegration } from "@/lib/integrations";

export interface KeyState {
  error?: string;
  /** Full secret, returned exactly once after creation. */
  secret?: string;
  name?: string;
}

export async function createApiKey(_prev: KeyState, formData: FormData): Promise<KeyState> {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") return { error: "Only owners can create API keys." };
  const name = String(formData.get("name") ?? "").trim();
  const env = formData.get("env") === "live" ? "live" : "test";
  const scopes = formData.getAll("scopes").map(String).filter((s) => ["read", "write"].includes(s));
  if (!name) return { error: "Give the key a name so you know where it is used." };
  if (scopes.length === 0) return { error: "Select at least one scope." };

  const key = generateApiKey(env);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({ org_id: ctx.org.id, name, key_prefix: key.prefix, key_hash: key.hash, scopes, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await supabase.from("audit_events").insert({
    org_id: ctx.org.id,
    actor_id: ctx.userId,
    entity: "api_key",
    entity_id: data.id,
    action: "created",
    after: { name, prefix: key.prefix, scopes, env },
  });
  revalidatePath("/app/integrations");
  return { secret: key.secret, name };
}

export async function revokeApiKey(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") return;
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .is("revoked_at", null)
    .select("name, key_prefix")
    .maybeSingle();
  if (data) {
    await supabase.from("audit_events").insert({
      org_id: ctx.org.id,
      actor_id: ctx.userId,
      entity: "api_key",
      entity_id: id,
      action: "revoked",
      before: { name: data.name, prefix: data.key_prefix },
    });
  }
  revalidatePath("/app/integrations");
}

export async function requestIntegration(formData: FormData) {
  const ctx = await requireOrg();
  if (ctx.role === "auditor") return;
  const slug = String(formData.get("slug") ?? "");
  const integration = findIntegration(slug);
  if (!integration) return;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integration_requests")
    .insert({ org_id: ctx.org.id, integration_slug: slug, requested_by: ctx.userId })
    .select("id")
    .single();
  if (!error && data) {
    await supabase.from("audit_events").insert({
      org_id: ctx.org.id,
      actor_id: ctx.userId,
      entity: "integration_request",
      entity_id: data.id,
      action: "requested",
      after: { integration: slug },
    });
  }
  revalidatePath("/app/integrations");
}
