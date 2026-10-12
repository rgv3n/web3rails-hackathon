import { hashApiKey } from "@/lib/api-keys";
import { serviceClient } from "./service";

export interface ApiSession {
  keyId: string;
  keyPrefix: string;
  orgId: string;
  orgName: string;
  isDemo: boolean;
  timezone: string;
  baseCurrency: string;
  scopes: string[];
}

/** Resolves a bearer API key (w3r_live_… / w3r_test_…) to its organization. Null when unknown or revoked. */
export async function resolveApiKey(secret: string | undefined): Promise<ApiSession | null> {
  if (!secret || !/^w3r_(live|test)_[A-Za-z0-9]{32}$/.test(secret)) return null;
  const sb = serviceClient();
  const { data } = await sb
    .from("api_keys")
    .select("id, key_prefix, scopes, revoked_at, organization:organizations(id, name, is_demo, timezone, base_currency)")
    .eq("key_hash", hashApiKey(secret))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  const org = data.organization as unknown as { id: string; name: string; is_demo: boolean; timezone: string; base_currency: string } | null;
  if (!org) return null;
  // last_used_at: best effort, never blocks the call
  void sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { keyId: data.id, keyPrefix: data.key_prefix, orgId: org.id, orgName: org.name, isDemo: org.is_demo, timezone: org.timezone, baseCurrency: org.base_currency, scopes: data.scopes ?? ["read"] };
}

/** Audit every tool call as actor 'api' (no user), with the key that made it. */
export async function auditApiCall(session: ApiSession, tool: string, args: unknown) {
  const sb = serviceClient();
  await sb.from("audit_events").insert({
    org_id: session.orgId, actor_id: null, actor_kind: "api", api_key_id: session.keyId,
    entity: "mcp_tool", entity_id: null, action: tool, after: { args }, reason: `API key ${session.keyPrefix}`,
  });
}
