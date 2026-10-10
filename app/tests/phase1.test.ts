/**
 * Phase 1 rules, run against the LOCAL Supabase stack (npx supabase start).
 * Covers: cross-organization isolation, auditor cannot mutate, idempotent import,
 * discrepancy recording, optimistic concurrency, monetary precision, approval invalidation.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ANON, SERVICE, URL } from "./env";

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
const PW = "test-password-" + run;

const WALLET_A = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const WALLET_A2 = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const EXTERNAL = "7Zb1bGi32pfsrBkzWdqd4dFhUXvkCe4b9NYSfx9GVkDT";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SIG1 = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const SIG2 = "3Q6uWiJiFEb4m1n6YcL2M7Y4k1tR9pWq8vZx2cHhGJbKdN5sTfP7aLrE6uVyX1oM9wB4zC8nDgS2hKqRtUvW3eYp";

interface Actor { id: string; client: SupabaseClient }
const users: string[] = [];
let orgA = "", orgB = "", walletA = "";
let adminA: Actor, operatorA: Actor, operator2A: Actor, auditorA: Actor, adminB: Actor;

async function makeUser(label: string): Promise<Actor> {
  const email = `${label}-${run}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { full_name: label } });
  if (error) throw error;
  users.push(data.user.id);
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW });
  if (e2) throw e2;
  return { id: data.user.id, client };
}

const rows = (over: Partial<Record<string, string>> = {}) => [
  { tx_signature: SIG1, instruction_index: "0", block_time: "2026-09-21T14:32:17Z", from_address: EXTERNAL, to_address: WALLET_A, token_mint: USDC, token_symbol: "USDC", token_decimals: "6", amount_raw: "4250000000", source_status: "finalized", ...over },
];

beforeAll(async () => {
  adminA = await makeUser("admin-a");
  operatorA = await makeUser("operator-a");
  operator2A = await makeUser("operator2-a");
  auditorA = await makeUser("auditor-a");
  adminB = await makeUser("admin-b");

  const { data: oa, error: ea } = await adminA.client.rpc("create_organization", { p_name: "Org A " + run, p_slug: "org-a-" + run });
  if (ea) throw ea;
  orgA = oa as string;
  const { data: ob, error: eb } = await adminB.client.rpc("create_organization", { p_name: "Org B " + run, p_slug: "org-b-" + run });
  if (eb) throw eb;
  orgB = ob as string;

  await admin.from("memberships").insert([
    { org_id: orgA, user_id: operatorA.id, role: "operator" },
    { org_id: orgA, user_id: operator2A.id, role: "operator" },
    { org_id: orgA, user_id: auditorA.id, role: "auditor" },
  ]);
  const { data: ent } = await adminA.client.from("legal_entities").select("id").eq("org_id", orgA).single();
  const { data: w, error: ew } = await adminA.client
    .from("wallets")
    .insert({ org_id: orgA, entity_id: ent!.id, chain: "solana", address: WALLET_A, label: "Ops" })
    .select("id")
    .single();
  if (ew) throw ew;
  walletA = w!.id;
  await adminA.client.from("wallets").insert({ org_id: orgA, entity_id: ent!.id, chain: "solana", address: WALLET_A2, label: "Treasury" });
});

afterAll(async () => {
  await admin.from("organizations").delete().in("id", [orgA, orgB]);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe("import: idempotency, precision, discrepancies", () => {
  it("imports once, then re-import counts duplicates and inserts nothing", async () => {
    const first = await operatorA.client.rpc("import_movements", { p_org: orgA, p_filename: "t1.csv", p_rows: rows() });
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ inserted: 1, duplicate: 0, discrepant: 0 });
    const again = await operatorA.client.rpc("import_movements", { p_org: orgA, p_filename: "t1-again.csv", p_rows: rows() });
    expect(again.data).toMatchObject({ inserted: 0, duplicate: 1, discrepant: 0 });
    const { count } = await adminA.client.from("movements").select("id", { count: "exact", head: true }).eq("org_id", orgA);
    expect(count).toBe(1);
  });

  it("keeps exact 39-digit amounts (no float)", async () => {
    const big = "123456789012345678901234567890123456789";
    const r = await operatorA.client.rpc("import_movements", { p_org: orgA, p_filename: "big.csv", p_rows: rows({ tx_signature: SIG2, amount_raw: big, token_decimals: "18" }) });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ inserted: 1 });
    const { data } = await adminA.client.from("movements").select("amount_raw:amount_raw_text").eq("tx_signature", SIG2).single();
    expect(data!.amount_raw).toBe(big); // exact through the JSON transport
  });

  it("re-import with a different amount records a discrepancy and opens an exception; stored value is kept", async () => {
    const r = await operatorA.client.rpc("import_movements", { p_org: orgA, p_filename: "t1-diff.csv", p_rows: rows({ amount_raw: "4250000001" }) });
    expect(r.data).toMatchObject({ inserted: 0, duplicate: 0, discrepant: 1 });
    const { data: m } = await adminA.client.from("movements").select("id, amount_raw:amount_raw_text").eq("tx_signature", SIG1).single();
    expect(m!.amount_raw).toBe("4250000000");
    const { data: d } = await adminA.client.from("import_discrepancies").select("field, stored_value, incoming_value").eq("movement_id", m!.id);
    expect(d).toEqual([{ field: "amount_raw", stored_value: "4250000000", incoming_value: "4250000001" }]);
    const { data: ex } = await adminA.client.from("exceptions").select("kind, status").eq("movement_id", m!.id);
    expect(ex).toEqual([{ kind: "import_discrepancy", status: "open" }]);
  });

  it("rejects rows that touch no declared wallet, with a per-row error", async () => {
    const r = await operatorA.client.rpc("import_movements", { p_org: orgA, p_filename: "bad.csv", p_rows: rows({ to_address: EXTERNAL, tx_signature: SIG2 }) });
    expect(r.data.inserted).toBe(0);
    expect(r.data.errors[0].error).toMatch(/declared wallet/);
  });

  it("direction follows the declared wallet (out when from is ours)", async () => {
    const sig = SIG2.slice(0, -1) + "A";
    await operatorA.client.rpc("import_movements", { p_org: orgA, p_filename: "out.csv", p_rows: rows({ tx_signature: sig, from_address: WALLET_A, to_address: EXTERNAL }) });
    const { data } = await adminA.client.from("movements").select("direction, wallet_id").eq("tx_signature", sig).single();
    expect(data).toEqual({ direction: "out", wallet_id: walletA });
  });
});

describe("permissions and isolation", () => {
  it("auditor can read but cannot import or edit context", async () => {
    const { data: list } = await auditorA.client.from("movements").select("id").eq("org_id", orgA);
    expect(list!.length).toBeGreaterThan(0);
    const imp = await auditorA.client.rpc("import_movements", { p_org: orgA, p_filename: "x.csv", p_rows: rows() });
    expect(imp.error?.message).toMatch(/FORBIDDEN/);
    const ctx = await auditorA.client.rpc("save_movement_context", { p_movement: list![0].id, p_expected_version: 0, p_counterparty_name: "X", p_purpose: "", p_category: "fee", p_reference: "", p_note: "", p_reason: "" });
    expect(ctx.error?.message).toMatch(/FORBIDDEN/);
    const upd = await auditorA.client.from("movements").update({ review_status: "approved" }).eq("id", list![0].id).select("id");
    expect(upd.data).toEqual([]); // RLS: no update policy → zero rows affected
  });

  it("another organization cannot read or mutate by ID", async () => {
    const { data: mine } = await adminA.client.from("movements").select("id").eq("org_id", orgA).limit(1).single();
    const { data: seen } = await adminB.client.from("movements").select("id").eq("id", mine!.id);
    expect(seen).toEqual([]);
    const { data: wallets } = await adminB.client.from("wallets").select("id").eq("org_id", orgA);
    expect(wallets).toEqual([]);
    const imp = await adminB.client.rpc("import_movements", { p_org: orgA, p_filename: "x.csv", p_rows: rows() });
    expect(imp.error?.message).toMatch(/FORBIDDEN/);
    const ctx = await adminB.client.rpc("save_movement_context", { p_movement: mine!.id, p_expected_version: 0, p_counterparty_name: "X", p_purpose: "", p_category: "fee", p_reference: "", p_note: "", p_reason: "" });
    expect(ctx.error?.message).toMatch(/FORBIDDEN|NOT_FOUND/);
    const { data: audit } = await adminB.client.from("audit_events").select("id").eq("org_id", orgA);
    expect(audit).toEqual([]);
  });

  it("the movement source is never updatable through the API, even by admins", async () => {
    const { data: mine } = await adminA.client.from("movements").select("id").eq("org_id", orgA).limit(1).single();
    const upd = await adminA.client.from("movements").update({ amount_raw: "1" }).eq("id", mine!.id).select("id");
    expect(upd.data).toEqual([]);
  });
});

describe("financial context: revisions, concurrency, approval invalidation", () => {
  let movementId = "";
  beforeAll(async () => {
    const { data } = await adminA.client.from("movements").select("id").eq("tx_signature", SIG1).single();
    movementId = data!.id;
  });

  it("saving creates revision 1, identifies the movement and writes an audit event with reason", async () => {
    const r = await operatorA.client.rpc("save_movement_context", { p_movement: movementId, p_expected_version: 0, p_counterparty_name: "Acme Ltd.", p_purpose: "Sept", p_category: "customer_payment", p_reference: "INV-291", p_note: "", p_reason: "Matched to statement" });
    expect(r.error).toBeNull();
    expect(r.data).toBe(1);
    const { data: m } = await adminA.client.from("movements").select("context_version, identification_status, reconciliation_status").eq("id", movementId).single();
    expect(m).toEqual({ context_version: 1, identification_status: "identified", reconciliation_status: "unmatched" });
    const { data: ev } = await adminA.client.from("audit_events").select("action, reason, actor_id").eq("entity_id", movementId).order("id", { ascending: false }).limit(1).single();
    expect(ev).toEqual({ action: "created", reason: "Matched to statement", actor_id: operatorA.id });
  });

  it("a stale version is rejected with a CONFLICT and nothing is written", async () => {
    const r = await operator2A.client.rpc("save_movement_context", { p_movement: movementId, p_expected_version: 0, p_counterparty_name: "Other", p_purpose: "", p_category: "vendor_payment", p_reference: "", p_note: "", p_reason: "" });
    expect(r.error?.message).toMatch(/^CONFLICT/);
    const { data: revs } = await adminA.client.from("movement_context_revisions").select("version").eq("movement_id", movementId);
    expect(revs!.map((x) => x.version).sort()).toEqual([1]);
  });

  it("two concurrent saves on the same version: exactly one wins", async () => {
    const call = (c: SupabaseClient, name: string) =>
      c.rpc("save_movement_context", { p_movement: movementId, p_expected_version: 1, p_counterparty_name: name, p_purpose: "", p_category: "customer_payment", p_reference: "", p_note: "", p_reason: "race" });
    const [a, b] = await Promise.all([call(operatorA.client, "A"), call(operator2A.client, "B")]);
    const ok = [a, b].filter((x) => !x.error);
    const conflicts = [a, b].filter((x) => x.error?.message.startsWith("CONFLICT"));
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    const { data: m } = await adminA.client.from("movements").select("context_version").eq("id", movementId).single();
    expect(m!.context_version).toBe(2);
  });

  it("internal transfer marks reconciliation not applicable; unknown category keeps it unidentified", async () => {
    const r1 = await operatorA.client.rpc("save_movement_context", { p_movement: movementId, p_expected_version: 2, p_counterparty_name: "", p_purpose: "", p_category: "internal_transfer", p_reference: "", p_note: "", p_reason: "" });
    expect(r1.error).toBeNull();
    let { data: m } = await adminA.client.from("movements").select("identification_status, reconciliation_status").eq("id", movementId).single();
    expect(m).toEqual({ identification_status: "identified", reconciliation_status: "not_applicable" });
    const r2 = await operatorA.client.rpc("save_movement_context", { p_movement: movementId, p_expected_version: 3, p_counterparty_name: "", p_purpose: "", p_category: "unknown", p_reference: "", p_note: "", p_reason: "" });
    expect(r2.error).toBeNull();
    ({ data: m } = await adminA.client.from("movements").select("identification_status, reconciliation_status").eq("id", movementId).single());
    expect(m).toEqual({ identification_status: "unidentified", reconciliation_status: "unmatched" });
  });

  it("a material change after approval sends the record back to pending and keeps all revisions", async () => {
    await admin.from("movements").update({ review_status: "approved" }).eq("id", movementId); // approval flow arrives in phase 4; set directly
    const r = await operatorA.client.rpc("save_movement_context", { p_movement: movementId, p_expected_version: 4, p_counterparty_name: "Acme Ltd.", p_purpose: "", p_category: "customer_payment", p_reference: "INV-291", p_note: "", p_reason: "correction" });
    expect(r.error).toBeNull();
    const { data: m } = await adminA.client.from("movements").select("review_status, context_version").eq("id", movementId).single();
    expect(m).toEqual({ review_status: "pending", context_version: 5 });
    const { data: revs } = await adminA.client.from("movement_context_revisions").select("version").eq("movement_id", movementId);
    expect(revs!.map((x) => x.version).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    const { data: ev } = await adminA.client.from("audit_events").select("after").eq("entity_id", movementId).order("id", { ascending: false }).limit(1).single();
    expect((ev!.after as { approval_invalidated: boolean }).approval_invalidated).toBe(true);
  });
});
