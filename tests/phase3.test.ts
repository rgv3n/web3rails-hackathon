/**
 * Phase 3 rules against the LOCAL Supabase stack: invoice import idempotency, deterministic 1:1 matching
 * with named signals, ambiguity never auto-linked, currency incompatibility, invoice consumed once,
 * race between two operators, partial payment flagged, exception resolution with actor.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:57321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "LOCAL_SUPABASE_SECRET_KEY";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
const PW = "test-password-" + run;

const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const EXT1 = "7Zb1bGi32pfsrBkzWdqd4dFhUXvkCe4b9NYSfx9GVkDT";
const EXT2 = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const sig = (n: number) => ("5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQ" + "ABCDEFGHJK"[n]).padEnd(88, "1").slice(0, 88);

interface Actor { id: string; client: SupabaseClient }
const users: string[] = [];
let org = ""; let entity = "";
let adm: Actor, op1: Actor, op2: Actor, aud: Actor;

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
const mv = (n: number, over: Partial<Record<string, string>> = {}) => ({
  tx_signature: sig(n), instruction_index: "0", block_time: "2026-09-21T14:32:17Z", from_address: EXT1, to_address: WALLET,
  token_mint: USDC, token_symbol: "USDC", token_decimals: "6", amount_raw: "4250000000", source_status: "finalized", ...over,
});
const inv = (ref: string, over: Partial<Record<string, string>> = {}) => ({
  external_ref: ref, counterparty_name: "Acme Customer SA", kind: "receivable", amount: "4250.00", currency: "USDC", issued_at: "2026-09-10", due_at: "2026-09-25", ...over,
});
const ctxOf = (c: SupabaseClient, id: string, v: number, cp: string, ref: string) =>
  c.rpc("save_movement_context", { p_movement: id, p_expected_version: v, p_counterparty_name: cp, p_purpose: "", p_category: "customer_payment", p_reference: ref, p_note: "", p_reason: "test" });
async function movementBySig(s: string) {
  const { data } = await admin.from("movements").select("id, context_version, reconciliation_status, matched_invoice_id").eq("org_id", org).eq("tx_signature", s).single();
  return data!;
}
async function proposals(id: string) {
  const { data } = await admin.from("match_proposals").select("invoice_id, signals, status").eq("movement_id", id).eq("status", "proposed");
  return data ?? [];
}
async function openExceptions(id: string) {
  const { data } = await admin.from("exceptions").select("kind").eq("movement_id", id).neq("status", "resolved");
  return (data ?? []).map((e) => e.kind).sort();
}

beforeAll(async () => {
  adm = await makeUser("adm"); op1 = await makeUser("op1"); op2 = await makeUser("op2"); aud = await makeUser("aud");
  const { data: o, error } = await adm.client.rpc("create_organization", { p_name: "Org M " + run, p_slug: "org-m-" + run });
  if (error) throw error;
  org = o as string;
  await admin.from("memberships").insert([
    { org_id: org, user_id: op1.id, role: "operator" }, { org_id: org, user_id: op2.id, role: "operator" }, { org_id: org, user_id: aud.id, role: "auditor" },
  ]);
  const { data: e } = await admin.from("legal_entities").select("id").eq("org_id", org).single();
  entity = e!.id;
  await adm.client.from("wallets").insert({ org_id: org, entity_id: entity, chain: "solana", address: WALLET, label: "Ops" });
});
afterAll(async () => {
  await admin.from("organizations").delete().eq("id", org);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe("invoice import", () => {
  it("imports, maps USDC to its mint, keeps fiat invoices unmatched-able, dedupes by reference, flags conflicting duplicates", async () => {
    const r = await op1.client.rpc("import_invoices", { p_org: org, p_filename: "inv.csv", p_rows: [inv("INV-1"), inv("INV-EUR", { currency: "EUR" })] });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ inserted: 2, duplicate: 0 });
    const { data: rows } = await admin.from("invoices").select("external_ref, token_mint, amount:amount_text").eq("org_id", org).order("external_ref");
    expect(rows).toEqual([{ external_ref: "INV-1", token_mint: USDC, amount: "4250.00000000" }, { external_ref: "INV-EUR", token_mint: null, amount: "4250.00000000" }]);
    const again = await op1.client.rpc("import_invoices", { p_org: org, p_filename: "inv2.csv", p_rows: [inv("INV-1"), inv("INV-1", { amount: "4251.00" })] });
    expect(again.data.inserted).toBe(0);
    expect(again.data.duplicate).toBe(1);
    expect(again.data.errors[0].error).toMatch(/already exists with different/);
  });
  it("auditor cannot import invoices", async () => {
    const r = await aud.client.rpc("import_invoices", { p_org: org, p_filename: "x.csv", p_rows: [inv("INV-X")] });
    expect(r.error?.message).toMatch(/FORBIDDEN/);
  });
});

describe("matching", () => {
  it("exact amount + reference + counterparty → one proposal with named signals; nothing accepted automatically", async () => {
    await op1.client.rpc("import_movements", { p_org: org, p_filename: "m.csv", p_rows: [mv(0)] });
    let m = await movementBySig(sig(0));
    const r = await ctxOf(op1.client, m.id, 0, "Acme Customer SA", "INV-1");
    expect(r.error).toBeNull();
    m = await movementBySig(sig(0));
    expect(m.reconciliation_status).toBe("proposed");
    const ps = await proposals(m.id);
    expect(ps).toHaveLength(1);
    expect([...ps[0].signals].sort()).toEqual(["amount_compatible", "counterparty_known", "date_window", "reference_exact"]);
    const { data: invRow } = await admin.from("invoices").select("status, linked_movement_id").eq("org_id", org).eq("external_ref", "INV-1").single();
    expect(invRow).toEqual({ status: "open", linked_movement_id: null });
    const { data: ev } = await admin.from("audit_events").select("actor_kind, actor_id, action").eq("entity_id", m.id).eq("entity", "match");
    expect(ev).toEqual([{ actor_kind: "system", actor_id: null, action: "proposed" }]);
  });

  it("amount outside tolerance and no reference → no candidate → no_invoice exception", async () => {
    await op1.client.rpc("import_movements", { p_org: org, p_filename: "m.csv", p_rows: [mv(1, { amount_raw: "4250020000" })] }); // 4250.02 vs tolerance 0.01
    let m = await movementBySig(sig(1));
    await ctxOf(op1.client, m.id, 0, "Someone Else", "");
    m = await movementBySig(sig(1));
    expect(m.reconciliation_status).toBe("unmatched");
    expect(await proposals(m.id)).toHaveLength(0);
    expect(await openExceptions(m.id)).toEqual(["no_invoice"]);
  });

  it("USDT movement does not match a USDC invoice of the same amount (token by mint, not symbol)", async () => {
    await op1.client.rpc("import_movements", { p_org: org, p_filename: "m.csv", p_rows: [mv(2, { token_mint: USDT, token_symbol: "USDT" })] });
    let m = await movementBySig(sig(2));
    await ctxOf(op1.client, m.id, 0, "Acme Customer SA", "INV-1");
    m = await movementBySig(sig(2));
    expect(await proposals(m.id)).toHaveLength(0);
    expect(m.reconciliation_status).toBe("unmatched");
  });

  it("two compatible invoices → ambiguous exception, two proposals, none accepted", async () => {
    await op1.client.rpc("import_invoices", { p_org: org, p_filename: "inv.csv", p_rows: [inv("INV-A", { amount: "100.00" }), inv("INV-B", { amount: "100.00" })] });
    await op1.client.rpc("import_movements", { p_org: org, p_filename: "m.csv", p_rows: [mv(3, { amount_raw: "100000000" })] });
    let m = await movementBySig(sig(3));
    await ctxOf(op1.client, m.id, 0, "Acme Customer SA", "");
    m = await movementBySig(sig(3));
    expect((await proposals(m.id)).length).toBe(2);
    expect(await openExceptions(m.id)).toEqual(["ambiguous_match"]);
    expect(m.matched_invoice_id).toBeNull();
  });

  it("partial payment (same counterparty, smaller than invoice, outside tolerance) → unsupported_partial, no fake match", async () => {
    await op1.client.rpc("import_invoices", { p_org: org, p_filename: "inv.csv", p_rows: [inv("INV-BIG", { amount: "9000.00" })] });
    await op1.client.rpc("import_movements", { p_org: org, p_filename: "m.csv", p_rows: [mv(4, { amount_raw: "3000000000" })] });
    let m = await movementBySig(sig(4));
    await ctxOf(op1.client, m.id, 0, "Acme Customer SA", "");
    m = await movementBySig(sig(4));
    expect(await proposals(m.id)).toHaveLength(0);
    expect(await openExceptions(m.id)).toEqual(["unsupported_partial"]);
  });
});

describe("decisions", () => {
  it("auditor cannot accept; operator accepts with reason; invoice consumed; decision and audit recorded", async () => {
    const m = await movementBySig(sig(0));
    const { data: invRow } = await admin.from("invoices").select("id").eq("org_id", org).eq("external_ref", "INV-1").single();
    const denied = await aud.client.rpc("decide_match", { p_movement: m.id, p_invoice: invRow!.id, p_kind: "accept", p_expected_version: m.context_version, p_reason: "x", p_learn_address: false });
    expect(denied.error?.message).toMatch(/FORBIDDEN/);
    const ok = await op1.client.rpc("decide_match", { p_movement: m.id, p_invoice: invRow!.id, p_kind: "accept", p_expected_version: m.context_version, p_reason: "statement line 12", p_learn_address: true });
    expect(ok.error).toBeNull();
    const after = await movementBySig(sig(0));
    expect(after.reconciliation_status).toBe("matched");
    expect(after.matched_invoice_id).toBe(invRow!.id);
    const { data: i2 } = await admin.from("invoices").select("status, linked_movement_id").eq("id", invRow!.id).single();
    expect(i2).toEqual({ status: "matched", linked_movement_id: m.id });
    const { data: dec } = await admin.from("match_decisions").select("kind, actor_id, reason").eq("movement_id", m.id);
    expect(dec).toEqual([{ kind: "accept", actor_id: op1.id, reason: "statement line 12" }]);
    const { data: learned } = await admin.from("counterparty_addresses").select("address, counterparty_name").eq("org_id", org);
    expect(learned).toEqual([{ address: EXT1, counterparty_name: "Acme Customer SA" }]);
  });

  it("a consumed invoice cannot be linked again", async () => {
    await op1.client.rpc("import_movements", { p_org: org, p_filename: "m.csv", p_rows: [mv(5)] });
    const m = await movementBySig(sig(5));
    const { data: invRow } = await admin.from("invoices").select("id").eq("org_id", org).eq("external_ref", "INV-1").single();
    const r = await op1.client.rpc("decide_match", { p_movement: m.id, p_invoice: invRow!.id, p_kind: "manual_link", p_expected_version: m.context_version, p_reason: "try", p_learn_address: false });
    expect(r.error?.message).toMatch(/CONFLICT: invoice INV-1 is already linked/);
  });

  it("race: two operators link the same open invoice to two movements at once → exactly one wins", async () => {
    await op1.client.rpc("import_invoices", { p_org: org, p_filename: "inv.csv", p_rows: [inv("INV-RACE", { amount: "77.00" })] });
    await op1.client.rpc("import_movements", { p_org: org, p_filename: "m.csv", p_rows: [mv(6, { amount_raw: "77000000" }), mv(7, { amount_raw: "77000000", from_address: EXT2 })] });
    const a = await movementBySig(sig(6)); const b = await movementBySig(sig(7));
    const { data: invRow } = await admin.from("invoices").select("id").eq("org_id", org).eq("external_ref", "INV-RACE").single();
    const call = (c: SupabaseClient, m: { id: string; context_version: number }) =>
      c.rpc("decide_match", { p_movement: m.id, p_invoice: invRow!.id, p_kind: "manual_link", p_expected_version: m.context_version, p_reason: "race", p_learn_address: false });
    const [ra, rb] = await Promise.all([call(op1.client, a), call(op2.client, b)]);
    const wins = [ra, rb].filter((x) => !x.error).length;
    const conflicts = [ra, rb].filter((x) => x.error?.message.startsWith("CONFLICT")).length;
    expect(wins).toBe(1);
    expect(conflicts).toBe(1);
    const { data: links } = await admin.from("movements").select("id").eq("matched_invoice_id", invRow!.id);
    expect(links).toHaveLength(1);
  });

  it("reject the only candidate → unmatched + no_invoice; unlink requires a reason and reopens the invoice", async () => {
    const m = await movementBySig(sig(0));
    const noReason = await op1.client.rpc("decide_match", { p_movement: m.id, p_invoice: null, p_kind: "unlink", p_expected_version: m.context_version, p_reason: "", p_learn_address: false });
    expect(noReason.error?.message).toMatch(/reason is required/);
    const ok = await op2.client.rpc("decide_match", { p_movement: m.id, p_invoice: null, p_kind: "unlink", p_expected_version: m.context_version, p_reason: "wrong invoice", p_learn_address: false });
    expect(ok.error).toBeNull();
    const after = await movementBySig(sig(0));
    expect(after.matched_invoice_id).toBeNull();
    expect(["proposed", "unmatched"]).toContain(after.reconciliation_status); // matching re-ran: INV-1 is open again → proposed
    const { data: i2 } = await admin.from("invoices").select("status").eq("org_id", org).eq("external_ref", "INV-1").single();
    expect(i2!.status).toBe("open");
    const ps = await proposals(after.id);
    expect(ps).toHaveLength(1);
    const rej = await op1.client.rpc("decide_match", { p_movement: after.id, p_invoice: ps[0].invoice_id, p_kind: "reject", p_expected_version: after.context_version, p_reason: "not ours", p_learn_address: false });
    expect(rej.error).toBeNull();
    const final = await movementBySig(sig(0));
    expect(final.reconciliation_status).toBe("unmatched");
    expect(await openExceptions(final.id)).toEqual(["no_invoice"]);
  });
});

describe("exceptions", () => {
  it("resolve requires a resolution, records actor; waiting requires a comment; auditor cannot", async () => {
    const m = await movementBySig(sig(1));
    const { data: ex } = await admin.from("exceptions").select("id").eq("movement_id", m.id).eq("kind", "no_invoice").neq("status", "resolved").single();
    const noRes = await op1.client.rpc("update_exception", { p_id: ex!.id, p_status: "resolved", p_assignee: null, p_comment: "", p_resolution: "" });
    expect(noRes.error?.message).toMatch(/resolution is required/);
    const noWait = await op1.client.rpc("update_exception", { p_id: ex!.id, p_status: "waiting", p_assignee: op2.id, p_comment: "", p_resolution: "" });
    expect(noWait.error?.message).toMatch(/waiting for/);
    const denied = await aud.client.rpc("update_exception", { p_id: ex!.id, p_status: "resolved", p_assignee: null, p_comment: "", p_resolution: "x" });
    expect(denied.error?.message).toMatch(/FORBIDDEN/);
    const wait = await op1.client.rpc("update_exception", { p_id: ex!.id, p_status: "waiting", p_assignee: op2.id, p_comment: "asked the customer for the invoice", p_resolution: "" });
    expect(wait.error).toBeNull();
    const done = await op2.client.rpc("update_exception", { p_id: ex!.id, p_status: "resolved", p_assignee: null, p_comment: "", p_resolution: "Customer confirmed: prepayment, no invoice" });
    expect(done.error).toBeNull();
    const { data: row } = await admin.from("exceptions").select("status, assignee_id, resolved_by, resolution, comments").eq("id", ex!.id).single();
    expect(row).toMatchObject({ status: "resolved", assignee_id: op2.id, resolved_by: op2.id, resolution: "Customer confirmed: prepayment, no invoice" });
    expect((row!.comments as unknown[]).length).toBe(1);
  });
});
