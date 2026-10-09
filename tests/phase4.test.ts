/**
 * Phase 4: approval preconditions, self-approval policy, return with reason, invalidation after approval,
 * export snapshot (correct rows, exact amounts, immutability after later edits, formula neutralisation, permissions).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rowsToCsv, neutralize, sha256 } from "../src/lib/export-csv";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:57321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "LOCAL_SUPABASE_SECRET_KEY";
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
const PW = "test-password-" + run;
const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const EXT1 = "7Zb1bGi32pfsrBkzWdqd4dFhUXvkCe4b9NYSfx9GVkDT";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const sig = (n: number) => ("5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQ" + "ABCDEFGHJK"[n]).padEnd(88, "2").slice(0, 88);

interface Actor { id: string; client: SupabaseClient }
const users: string[] = [];
let org = ""; let entity = "";
let adm: Actor, op: Actor, rev: Actor, aud: Actor;

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
const ctxOf = (c: SupabaseClient, id: string, v: number, cp: string, ref: string, cat = "customer_payment") =>
  c.rpc("save_movement_context", { p_movement: id, p_expected_version: v, p_counterparty_name: cp, p_purpose: "", p_category: cat, p_reference: ref, p_note: "", p_reason: "test" });
async function m(s: string) {
  const { data } = await admin.from("movements").select("id, context_version, review_status, reconciliation_status, matched_invoice_id").eq("org_id", org).eq("tx_signature", s).single();
  return data!;
}
const review = (c: SupabaseClient, id: string, v: number, action: string, reason = "") =>
  c.rpc("review_movement", { p_movement: id, p_action: action, p_expected_version: v, p_reason: reason });

beforeAll(async () => {
  adm = await makeUser("adm"); op = await makeUser("op"); rev = await makeUser("rev"); aud = await makeUser("aud");
  const { data: o, error } = await adm.client.rpc("create_organization", { p_name: "Org R " + run, p_slug: "org-r-" + run });
  if (error) throw error;
  org = o as string;
  await admin.from("memberships").insert([
    { org_id: org, user_id: op.id, role: "operator" }, { org_id: org, user_id: rev.id, role: "reviewer" }, { org_id: org, user_id: aud.id, role: "auditor" },
  ]);
  const { data: e } = await admin.from("legal_entities").select("id").eq("org_id", org).single();
  entity = e!.id;
  await adm.client.from("wallets").insert({ org_id: org, entity_id: entity, chain: "solana", address: WALLET, label: "Ops" });
  await op.client.rpc("import_invoices", { p_org: org, p_filename: "i.csv", p_rows: [
    { external_ref: "INV-1", counterparty_name: "=Acme Customer SA", kind: "receivable", amount: "4250.00", currency: "USDC", issued_at: "2026-09-10", due_at: "2026-09-25" },
  ] });
  await op.client.rpc("import_movements", { p_org: org, p_filename: "m.csv", p_rows: [mv(0), mv(1, { amount_raw: "123456789012345678901" , token_decimals: "18", block_time: "2026-09-22T10:00:00Z" })] });
});
afterAll(async () => {
  await admin.from("organizations").delete().eq("id", org);
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe("approval preconditions", () => {
  it("unidentified / unmatched / open-exception records are blocked with reasons; the server refuses", async () => {
    const a = await m(sig(0));
    const { data: b } = await rev.client.rpc("approval_blockers", { p_movement: a.id });
    expect(b).toEqual(expect.arrayContaining([expect.stringMatching(/context incomplete/), expect.stringMatching(/Not reconciled/)]));
    const r = await review(rev.client, a.id, a.context_version, "approve");
    expect(r.error?.message).toMatch(/^BLOCKED/);
  });

  it("operator cannot approve; reviewer approves an eligible record; audit + review rows", async () => {
    let a = await m(sig(0));
    await ctxOf(op.client, a.id, 0, "=Acme Customer SA", "INV-1");
    a = await m(sig(0));
    const { data: inv } = await admin.from("invoices").select("id").eq("org_id", org).eq("external_ref", "INV-1").single();
    await op.client.rpc("decide_match", { p_movement: a.id, p_invoice: inv!.id, p_kind: "accept", p_expected_version: a.context_version, p_reason: "ok", p_learn_address: false });
    const denied = await review(op.client, a.id, a.context_version, "approve");
    expect(denied.error?.message).toMatch(/FORBIDDEN/);
    const { data: b } = await rev.client.rpc("approval_blockers", { p_movement: a.id });
    expect(b).toEqual([]);
    const ok = await review(rev.client, a.id, a.context_version, "approve", "month close");
    expect(ok.error).toBeNull();
    a = await m(sig(0));
    expect(a.review_status).toBe("approved");
    const { data: rv } = await admin.from("reviews").select("action, actor_id, context_version").eq("movement_id", a.id);
    expect(rv).toEqual([{ action: "approved", actor_id: rev.id, context_version: 1 }]);
  });

  it("self-approval: off by default blocks the author (even an admin+reviewer); on allows it", async () => {
    let b = await m(sig(1));
    await ctxOf(adm.client, b.id, 0, "Treasury desk", "", "treasury"); // admin has financial_role reviewer and authored the revision
    b = await m(sig(1));
    expect(b.reconciliation_status).toBe("not_applicable");
    const { data: blockers } = await adm.client.rpc("approval_blockers", { p_movement: b.id });
    expect(blockers).toEqual([expect.stringMatching(/Self-approval is off/)]);
    const refused = await review(adm.client, b.id, b.context_version, "approve");
    expect(refused.error?.message).toMatch(/Self-approval is off/);
    // another reviewer can
    const { data: other } = await rev.client.rpc("approval_blockers", { p_movement: b.id });
    expect(other).toEqual([]);
    // turn the policy on (audited) and the author may approve
    const set = await adm.client.rpc("update_matching_settings", { p_org: org, p_tolerance: "0.01", p_window_days: 30, p_allow_self_approval: true });
    expect(set.error).toBeNull();
    const { data: now } = await adm.client.rpc("approval_blockers", { p_movement: b.id });
    expect(now).toEqual([]);
    await adm.client.rpc("update_matching_settings", { p_org: org, p_tolerance: "0.01", p_window_days: 30, p_allow_self_approval: false });
  });

  it("return requires a reason, opens an exception assigned to the author, and a new revision clears it", async () => {
    let b = await m(sig(1));
    const noReason = await review(rev.client, b.id, b.context_version, "return");
    expect(noReason.error?.message).toMatch(/reason is required/);
    const ret = await review(rev.client, b.id, b.context_version, "return", "wrong category");
    expect(ret.error).toBeNull();
    b = await m(sig(1));
    expect(b.review_status).toBe("correction_requested");
    const { data: ex } = await admin.from("exceptions").select("kind, status, assignee_id, reason").eq("movement_id", b.id).neq("status", "resolved");
    expect(ex).toEqual([{ kind: "other", status: "open", assignee_id: adm.id, reason: "Returned by reviewer: wrong category" }]);
    await ctxOf(op.client, b.id, b.context_version, "Treasury desk", "", "treasury");
    b = await m(sig(1));
    expect(b.review_status).toBe("pending");
    const { data: ex2 } = await admin.from("exceptions").select("status").eq("movement_id", b.id).eq("kind", "other");
    expect(ex2).toEqual([{ status: "resolved" }]);
  });
});

describe("export snapshot", () => {
  let exportId = "";
  it("auditor cannot export; reviewer exports only approved rows with exact amounts; checksum frozen", async () => {
    const denied = await aud.client.rpc("create_export", { p_org: org, p_from: "2026-09-01", p_to: "2026-09-30", p_entity: null });
    expect(denied.error?.message).toMatch(/FORBIDDEN/);
    const { data: id, error } = await rev.client.rpc("create_export", { p_org: org, p_from: "2026-09-01", p_to: "2026-09-30", p_entity: null });
    expect(error).toBeNull();
    exportId = id as string;
    const { data: items } = await rev.client.from("export_items").select("row").eq("export_id", exportId);
    expect(items).toHaveLength(1); // only sig(0) is approved
    const row = items![0].row as Record<string, string>;
    expect(row.amount_raw).toBe("4250000000");
    expect(row.amount).toBe("4250");
    expect(row.invoice_ref).toBe("INV-1");
    expect(row.counterparty).toBe("=Acme Customer SA");
    expect(row.approved_by).toBe("rev");
    const csv = rowsToCsv(items!.map((i) => i.row as Record<string, unknown>));
    expect(csv.split("\r\n")[1]).toContain("'=Acme Customer SA"); // neutralised in the file, untouched in the data
    expect(csv).toContain(",4250,4250000000,6,");
    await rev.client.rpc("set_export_checksum", { p_export: exportId, p_checksum: sha256(csv) });
    const { data: exp } = await rev.client.from("exports").select("record_count, checksum_sha256").eq("id", exportId).single();
    expect(exp).toEqual({ record_count: 1, checksum_sha256: sha256(csv) });
  });

  it("a later material correction invalidates the approval but leaves the earlier export untouched", async () => {
    let a = await m(sig(0));
    const r = await op.client.rpc("save_movement_context", { p_movement: a.id, p_expected_version: a.context_version, p_counterparty_name: "Acme Customer SA (corrected)", p_purpose: "", p_category: "customer_payment", p_reference: "INV-1", p_note: "", p_reason: "typo" });
    expect(r.error).toBeNull();
    a = await m(sig(0));
    expect(a.review_status).toBe("pending");
    const { data: rv } = await admin.from("reviews").select("action").eq("movement_id", a.id).order("decided_at");
    expect(rv!.map((x) => x.action)).toEqual(["approved", "invalidated"]);
    const { data: items } = await rev.client.from("export_items").select("row").eq("export_id", exportId);
    expect((items![0].row as Record<string, string>).counterparty).toBe("=Acme Customer SA");
    const { data: exp } = await rev.client.from("exports").select("checksum_sha256").eq("id", exportId).single();
    expect(exp!.checksum_sha256).toBe(sha256(rowsToCsv(items!.map((i) => i.row as Record<string, unknown>))));
    // a new export now contains nothing (no approved rows)
    const { data: id2 } = await rev.client.rpc("create_export", { p_org: org, p_from: "2026-09-01", p_to: "2026-09-30", p_entity: null });
    const { data: exp2 } = await rev.client.from("exports").select("record_count").eq("id", id2 as string).single();
    expect(exp2!.record_count).toBe(0);
  });

  it("other organizations cannot read the export", async () => {
    const outsider = await makeUser("outsider");
    const { data } = await outsider.client.from("exports").select("id").eq("id", exportId);
    expect(data).toEqual([]);
    const { data: items } = await outsider.client.from("export_items").select("row").eq("export_id", exportId);
    expect(items).toEqual([]);
  });
});

describe("csv helpers", () => {
  it("neutralises formula prefixes only in text columns and quotes commas/quotes", () => {
    expect(neutralize("=SUM(A1)", "counterparty")).toBe("'=SUM(A1)");
    expect(neutralize("-5", "amount")).toBe("-5");
    expect(neutralize("+34 600", "purpose")).toBe("'+34 600");
    const csv = rowsToCsv([{ counterparty: 'Acme, "the" Ltd', amount: "1.5" }]);
    expect(csv).toContain('"Acme, ""the"" Ltd"');
  });
});
