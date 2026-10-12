/**
 * Service-role Supabase client for the MCP server. This is the ONLY place in the front office that uses the service key.
 * Every query made with it MUST be scoped by org_id (the organization resolved from the API key): there is no RLS
 * safety net for this role. Keep this module small and reviewable.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("MCP server not configured (SUPABASE_SERVICE_ROLE_KEY)");
  cached ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
export const mcpConfigured = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
