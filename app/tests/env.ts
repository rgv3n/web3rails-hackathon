/**
 * Test environment. The anon/publishable key of the local stack is public by design; the service-role key is not
 * committed: export it as SUPABASE_SERVICE_ROLE_KEY from `npx supabase status -o env` (strip the quotes) before running `npm test`.
 */
export const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:57321";
export const ANON = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? "";
if (!SERVICE) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Run: export SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2- | tr -d '\"') && npm test");
}
