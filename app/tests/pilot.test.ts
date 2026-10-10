/**
 * Spec §8 — pilot acceptance scenario, end to end, against the local stack.
 * Two legal entities, several wallets, operators + reviewer, a second organization for isolation, and a labelled
 * dataset: exact match, unknown counterparty, duplicate reference, amount difference, similar-symbol token,
 * internal transfer, missing valuation, unsupported partial payment.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rowsToCsv, sha256 } from "../src/lib/export-csv";

import { ANON, SERVICE, URL } from "./env";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
const PW = "test-password-" + run;

const W_ES_OPS = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const W_ES_TRE = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const W_UK_OPS = "3Mz5Ywq1nRm8v2Kc7Lx9pBd4Hs6Tg1Je8Fa2Qn5Rk7Vb";
const CUST = "7Zb1bGi32pfsrBkzWdqd4dFhUXvkCe4b9NYSfx9GVkDT";
const UNKNOWN = "2hJ7kWq9PzX4mR1tY6vB8nC3dF5gL2sA7eU9jR4pQ1wE";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const sig = (n: number) => ("5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQ" + "ABCDEFGHJKLMNPQR"[n]).padEnd(88, "3").slice(0, 88);

interface Actor { id: string; client: SupabaseClient }
const users: string[] = [];
let org = "", org2 = "", entES = "", entUK = "";
let adm: Actor, op1: Actor, op2: Actor, rev: Actor, aud: Actor, adm2: Actor;

async function makeUser(label: string): Promise<Actor> {
  const email = `${label}-${run}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { full_name: label } });
  if (error) throw error;
  users.push(data.user.id);
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await client.auth.signInWithPassword({ email, password: PW });
  return { id: data.user.id, client };
}
const mv = (n: number, to: string, from: string, amount: string, over: Partial<Record<string, string>> = {}) => ({
  tx_signature: sig(n), instruction_index: "0", block_time: "2026-09-21T14:32:17Z", from_address: from, to_address: to,
  token_mint: USDC, token_symbol: "USDC", token_decimals: "6", amount_raw: amount, source_status: "finalized", ...over,
});
async function bySig(s: string) {
  const { data } = await admin.from("movements").select("id, context_version, review_status, reconciliation_status, identification_status, matched_invoice_id").eq("org_id", org).eq("tx_signature", s).single();
  return data!;
}
const ctxOf = (c: SupabaseClient, id: string, v: number, cp: string, ref: string, cat = "customer_payment") =>
  c.rpc("save_movement_context", { p_movement: id, p_expected_version: v, p_counterparty_name: cp, p_purpose: "", p_category: cat, p_reference: ref, p_note: "", p_reason: "pilot" });
async function exc(id: string) {
  const { data } = await admin.from("exceptions").select("kind").eq("movement_id", id).neq("status", "resolved");
  return (data ?? []).map((e) => e.kind).sort();
}

beforeAll(async () => {
  [adm, op1, op2, rev, aud, adm2] = await Promise.all(["adm", "op1", "op2", "rev", "aud", "adm2"].map(makeUser));
  org = (await adm.client.rpc("create_organization", { p_name: "Pilot " + run, p_slug: "pilot-" + run })).data as string;
  org2 = (await adm2.client.rpc("create_organization", { p_name: "Other " + run, p_slug: "other-" + run })).data as string;
  await admin.from("memberships").insert([
    { org_id: org, user_id: op1.id, role: "operator" }, { org_id: org, user_id: op2.id, role: "operator" },
    { org_id: org, user_id: rev.id, role: "reviewer" }, { org_id: org, user_id: aud.id, role: "auditor" },
  ]);
  entES = (await admin.from("legal_entities").select("id").eq("org_id", org).single()).data!.id;
  entUK = (await adm.client.from("legal_entities").insert({ org_id: org, name: "Pilot UK Ltd", reporting_currency: "USD" }).select("id").single()).data!.id;
  await adm.client.from("wallets").insert([
    { org_id: org, entity_id: entES, chain: "solana", address: W_ES_OPS, label: "ES ops" },
    { org_id: org, entity_id: entES, chain: "solana", address: W_ES_TRE, label: "ES treasury" },
    { org_id: org, entity_id: entUK, chain: "solana", address: W_UK_OPS, label: "UK ops" },
  ]);
});
afterAll(async () => {
  await admin.from("organizations").delete().in("id", [org, org2]);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe("§8 pilot acceptance", () => {
  const dataset = () => [
    mv(0, W_ES_OPS, CUST, "4250000000"),                                   // exact match → INV-100
    mv(1, W_ES_OPS, UNKNOWN, "999000000"),                                 // unknown counterparty, no invoice
    mv(2, W_ES_OPS, CUST, "1000050000"),                                   // 1000.05 vs invoice 1000.00 → outside 0.01
    mv(3, W_ES_OPS, CUST, "500000000", { token_mint: USDT, token_symbol: "USDT" }), // similar symbol, different mint
    mv(4, W_ES_TRE, W_ES_OPS, "100000000000"),                             // internal transfer between own wallets
    mv(5, W_ES_OPS, CUST, "3000000000"),                                   // partial of INV-BIG (9000)
    mv(6, W_UK_OPS, CUST, "4250000000"),                                   // UK entity: must not match ES invoices
  ];
  const invoices = () => [
    { external_ref: "INV-100", counterparty_name: "Customer SA", kind: "receivable", amount: "4250.00", currency: "USDC", issued_at: "2026-09-10", due_at: "2026-09-25" },
    { external_ref: "INV-200", counterparty_name: "Customer SA", kind: "receivable", amount: "1000.00", currency: "USDC", issued_at: "2026-09-10" },
    { external_ref: "INV-300", counterparty_name: "Customer SA", kind: "receivable", amount: "500.00", currency: "USDC", issued_at: "2026-09-10" },
    { external_ref: "INV-BIG", counterparty_name: "Customer SA", kind: "receivable", amount: "9000.00", currency: "USDC", issued_at: "2026-09-10" },
    { external_ref: "INV-100", counterparty_name: "Customer SA", kind: "receivable", amount: "4250.00", currency: "USDC", issued_at: "2026-09-10" }, // duplicate reference in the same file
  ];

  it("re-importing does not duplicate movements or invoices", async () => {
    const m1 = await op1.client.rpc("import_movements", { p_org: org, p_filename: "pilot.csv", p_rows: dataset() });
    expect(m1.data).toMatchObject({ inserted: 7, duplicate: 0, discrepant: 0 });
    const i1 = await op1.client.rpc("import_invoices", { p_org: org, p_filename: "inv.csv", p_rows: invoices() });
    expect(i1.data).toMatchObject({ inserted: 4, duplicate: 1 });
    const m2 = await op1.client.rpc("import_movements", { p_org: org, p_filename: "pilot.csv", p_rows: dataset() });
    expect(m2.data).toMatchObject({ inserted: 0, duplicate: 7 });
    const i2 = await op1.client.rpc("import_invoices", { p_org: org, p_filename: "inv.csv", p_rows: invoices() });
    expect(i2.data).toMatchObject({ inserted: 0, duplicate: 5 });
    expect((await admin.from("movements").select("id", { count: "exact", head: true }).eq("org_id", org)).count).toBe(7);
    expect((await admin.from("invoices").select("id", { count: "exact", head: true }).eq("org_id", org)).count).toBe(4);
  });

  it("valuation is absent, never zero", async () => {
    const { count } = await admin.from("valuations").select("id", { count: "exact", head: true }).eq("org_id", org);
    expect(count).toBe(0);
  });

  it("a valid match is accepted and keeps its explanation; the UK entity never sees ES invoices", async () => {
    let a = await bySig(sig(0));
    await ctxOf(op1.client, a.id, 0, "Customer SA", "INV-100");
    a = await bySig(sig(0));
    const { data: ps } = await admin.from("match_proposals").select("invoice_id, signals").eq("movement_id", a.id).eq("status", "proposed");
    expect(ps).toHaveLength(1);
    expect([...ps![0].signals].sort()).toEqual(["amount_compatible", "counterparty_known", "date_window", "reference_exact"]);
    const acc = await op1.client.rpc("decide_match", { p_movement: a.id, p_invoice: ps![0].invoice_id, p_kind: "accept", p_expected_version: a.context_version, p_reason: "bank statement", p_learn_address: true });
    expect(acc.error).toBeNull();
    const { data: dec } = await admin.from("match_decisions").select("kind, reason, proposal:match_proposals(signals)").eq("movement_id", a.id).single();
    expect(dec!.kind).toBe("accept");
    expect((dec!.proposal as unknown as { signals: string[] }).signals).toContain("reference_exact");
    // UK
    let u = await bySig(sig(6));
    await ctxOf(op1.client, u.id, 0, "Customer SA", "INV-100");
    u = await bySig(sig(6));
    expect(u.reconciliation_status).toBe("unmatched");
    expect(await exc(u.id)).toEqual(["no_invoice"]);
  });

  it("unknown counterparty, amount difference, similar-symbol token and partial payment each end as the right exception; internal transfer needs no invoice", async () => {
    let b = await bySig(sig(1)); await ctxOf(op1.client, b.id, 0, "", "", "unknown"); b = await bySig(sig(1));
    expect(b.identification_status).toBe("unidentified");
    let c = await bySig(sig(2)); await ctxOf(op1.client, c.id, 0, "Customer SA", ""); c = await bySig(sig(2));
    expect(c.reconciliation_status).toBe("unmatched");
    expect(await exc(c.id)).toEqual(["amount_mismatch"]); // 1000.05 vs 1000.00 outside 0.01; explained, nothing fabricated
    let d = await bySig(sig(3)); await ctxOf(op1.client, d.id, 0, "Customer SA", "INV-300"); d = await bySig(sig(3));
    expect(d.reconciliation_status).toBe("unmatched"); // USDT ≠ USDC even with exact reference and amount
    let e = await bySig(sig(4)); await ctxOf(op1.client, e.id, 0, "", "", "internal_transfer"); e = await bySig(sig(4));
    expect(e.reconciliation_status).toBe("not_applicable");
    let f = await bySig(sig(5)); await ctxOf(op1.client, f.id, 0, "Customer SA", ""); f = await bySig(sig(5));
    expect(await exc(f.id)).toEqual(["unsupported_partial"]);
  });

  it("an ambiguous candidate is never auto-linked, and an invoice cannot be linked twice in a race", async () => {
    await op1.client.rpc("import_invoices", { p_org: org, p_filename: "inv.csv", p_rows: [
      { external_ref: "INV-R1", counterparty_name: "Customer SA", kind: "receivable", amount: "77.00", currency: "USDC", issued_at: "2026-09-10" },
      { external_ref: "INV-R2", counterparty_name: "Customer SA", kind: "receivable", amount: "77.00", currency: "USDC", issued_at: "2026-09-10" },
    ] });
    await op1.client.rpc("import_movements", { p_org: org, p_filename: "r.csv", p_rows: [mv(7, W_ES_OPS, CUST, "77000000"), mv(8, W_ES_OPS, UNKNOWN, "77000000")] });
    let g = await bySig(sig(7)); await ctxOf(op1.client, g.id, 0, "Customer SA", ""); g = await bySig(sig(7));
    expect(await exc(g.id)).toEqual(["ambiguous_match"]);
    expect(g.matched_invoice_id).toBeNull();
    const h = await bySig(sig(8));
    const { data: r1 } = await admin.from("invoices").select("id").eq("org_id", org).eq("external_ref", "INV-R1").single();
    const call = (c: SupabaseClient, m: { id: string; context_version: number }) =>
      c.rpc("decide_match", { p_movement: m.id, p_invoice: r1!.id, p_kind: "manual_link", p_expected_version: m.context_version, p_reason: "race", p_learn_address: false });
    const [x, y] = await Promise.all([call(op1.client, g), call(op2.client, h)]);
    expect([x, y].filter((r) => !r.error)).toHaveLength(1);
    expect([x, y].filter((r) => r.error?.message.startsWith("CONFLICT"))).toHaveLength(1);
  });

  it("an exception is resolved with reason and actor; an incomplete record is not approved", async () => {
    const c = await bySig(sig(2));
    const { data: ex } = await admin.from("exceptions").select("id").eq("movement_id", c.id).eq("kind", "amount_mismatch").neq("status", "resolved").single();
    const r = await op2.client.rpc("update_exception", { p_id: ex!.id, p_status: "resolved", p_assignee: op2.id, p_comment: "", p_resolution: "Customer paid a fee on top; invoice INV-200 settled by agreement" });
    expect(r.error).toBeNull();
    const { data: row } = await admin.from("exceptions").select("resolved_by, resolution").eq("id", ex!.id).single();
    expect(row).toEqual({ resolved_by: op2.id, resolution: "Customer paid a fee on top; invoice INV-200 settled by agreement" });
    const blocked = await rev.client.rpc("review_movement", { p_movement: c.id, p_action: "approve", p_expected_version: c.context_version, p_reason: "" });
    expect(blocked.error?.message).toMatch(/BLOCKED: .*Not reconciled/);
  });

  it("a material correction invalidates approval and keeps earlier revisions; export holds the approved rows exactly; reload keeps everything", async () => {
    let a = await bySig(sig(0));
    const ok = await rev.client.rpc("review_movement", { p_movement: a.id, p_action: "approve", p_expected_version: a.context_version, p_reason: "close" });
    expect(ok.error).toBeNull();
    const { data: expId } = await rev.client.rpc("create_export", { p_org: org, p_from: "2026-09-01", p_to: "2026-09-30", p_entity: entES });
    const { data: items } = await rev.client.from("export_items").select("row").eq("export_id", expId as string);
    expect(items).toHaveLength(1);
    const row = items![0].row as Record<string, string>;
    expect(row).toMatchObject({ amount_raw: "4250000000", amount: "4250", invoice_ref: "INV-100", entity: "Pilot " + run, approved_by: "rev" });
    const csv = rowsToCsv(items!.map((i) => i.row as Record<string, unknown>));
    await rev.client.rpc("set_export_checksum", { p_export: expId as string, p_checksum: sha256(csv) });
    // correction after approval
    await ctxOf(op2.client, a.id, a.context_version, "Customer SA", "INV-100");
    a = await bySig(sig(0));
    expect(a.review_status).toBe("pending");
    const { data: revs } = await admin.from("movement_context_revisions").select("version").eq("movement_id", a.id);
    expect(revs!.length).toBe(2);
    const { data: again } = await rev.client.from("export_items").select("row").eq("export_id", expId as string);
    expect(sha256(rowsToCsv(again!.map((i) => i.row as Record<string, unknown>)))).toBe(sha256(csv));
    // "reload": a fresh client sees the same state
    const fresh = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    await fresh.auth.signInWithPassword({ email: `aud-${run}@example.test`, password: PW });
    const { data: seen } = await fresh.from("movements").select("review_status, reconciliation_status, context_version").eq("id", a.id).single();
    expect(seen).toEqual({ review_status: "pending", reconciliation_status: "matched", context_version: 2 });
    const { data: trail } = await fresh.from("audit_events").select("entity, action").eq("entity_id", a.id).order("id");
    expect(trail!.map((t) => `${t.entity}:${t.action}`)).toEqual(expect.arrayContaining(["movement_context:created", "match:proposed", "match:accept", "review:approved", "review:invalidated", "movement_context:revised"]));
  });

  it("auditor cannot mutate; the other organization cannot reach anything by ID", async () => {
    const a = await bySig(sig(0));
    expect((await aud.client.rpc("save_movement_context", { p_movement: a.id, p_expected_version: a.context_version, p_counterparty_name: "x", p_purpose: "", p_category: "fee", p_reference: "", p_note: "", p_reason: "" })).error?.message).toMatch(/FORBIDDEN/);
    expect((await aud.client.rpc("create_export", { p_org: org, p_from: "2026-09-01", p_to: "2026-09-30", p_entity: null })).error?.message).toMatch(/FORBIDDEN/);
    expect((await aud.client.from("exceptions").update({ status: "resolved" }).eq("org_id", org).select("id")).data).toEqual([]);
    for (const table of ["movements", "invoices", "exceptions", "exports", "audit_events", "wallets", "match_proposals"]) {
      const { data } = await adm2.client.from(table).select("id").eq("org_id", org);
      expect(data, table).toEqual([]);
    }
    expect((await adm2.client.rpc("review_movement", { p_movement: a.id, p_action: "approve", p_expected_version: 2, p_reason: "" })).error?.message).toMatch(/FORBIDDEN|NOT_FOUND/);
  });
});
