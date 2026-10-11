/**
 * Read-only queries behind the MCP tools. Every query filters by session.orgId. Amounts are returned as exact
 * decimal strings (from amount_raw / decimals), never floats. Nothing here writes financial data.
 */
import { formatTokenAmount } from "@/lib/money";
import type { ApiSession } from "./auth";
import { serviceClient } from "./service";

const amount = (raw: string, decimals: number) => formatTokenAmount(raw, decimals, { maxFraction: decimals });

export async function overview(s: ApiSession, from?: string, to?: string) {
  const sb = serviceClient();
  let q = sb.from("movements").select("id, direction, token_symbol, amount_raw, token_decimals, identification_status, reconciliation_status, review_status, block_time").eq("org_id", s.orgId);
  if (from) q = q.gte("block_time", from);
  if (to) q = q.lte("block_time", to + "T23:59:59Z");
  const [{ data: mv }, { count: openExceptions }, { count: exportsCount }, { data: wallets }] = await Promise.all([
    q,
    sb.from("exceptions").select("id", { count: "exact", head: true }).eq("org_id", s.orgId).neq("status", "resolved"),
    sb.from("exports").select("id", { count: "exact", head: true }).eq("org_id", s.orgId),
    sb.from("wallets").select("label, address, ownership, control_verified_at, last_synced_at, status").eq("org_id", s.orgId).eq("status", "active"),
  ]);
  const rows = mv ?? [];
  const sum = (dir: "in" | "out") => {
    const by: Record<string, bigint> = {};
    const dec: Record<string, number> = {};
    for (const r of rows.filter((r) => r.direction === dir)) { by[r.token_symbol ?? "?"] = (by[r.token_symbol ?? "?"] ?? 0n) + BigInt(r.amount_raw); dec[r.token_symbol ?? "?"] = r.token_decimals; }
    return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, amount(v.toString(), dec[k])]));
  };
  return {
    organization: s.orgName, demo: s.isDemo, period: { from: from ?? null, to: to ?? null },
    movements: rows.length,
    unidentified: rows.filter((r) => r.identification_status === "unidentified").length,
    unmatched: rows.filter((r) => r.reconciliation_status === "unmatched").length,
    proposed: rows.filter((r) => r.reconciliation_status === "proposed").length,
    matched: rows.filter((r) => r.reconciliation_status === "matched").length,
    approved: rows.filter((r) => r.review_status === "approved").length,
    received_by_token: sum("in"), paid_by_token: sum("out"),
    open_exceptions: openExceptions ?? 0, exports: exportsCount ?? 0,
    wallets: (wallets ?? []).map((w) => ({ label: w.label, address: w.address, identity: w.ownership, control_proven: Boolean(w.control_verified_at), last_synced_at: w.last_synced_at })),
  };
}

export async function listMovements(s: ApiSession, f: { from?: string; to?: string; direction?: "in" | "out"; reconciliation?: string; review?: string; limit?: number }) {
  const sb = serviceClient();
  let q = sb.from("movements").select("id, tx_signature, block_time, direction, token_symbol, amount_raw, token_decimals, from_address, to_address, identification_status, reconciliation_status, review_status, matched_invoice_id, source, raw").eq("org_id", s.orgId).order("block_time", { ascending: false }).limit(Math.min(f.limit ?? 50, 200));
  if (f.from) q = q.gte("block_time", f.from);
  if (f.to) q = q.lte("block_time", f.to + "T23:59:59Z");
  if (f.direction) q = q.eq("direction", f.direction);
  if (f.reconciliation) q = q.eq("reconciliation_status", f.reconciliation);
  if (f.review) q = q.eq("review_status", f.review);
  const { data } = await q;
  return (data ?? []).map((m) => ({
    id: m.id, signature: m.tx_signature, block_time: m.block_time, direction: m.direction,
    amount: amount(m.amount_raw, m.token_decimals), token: m.token_symbol, counterparty: m.direction === "in" ? m.from_address : m.to_address,
    identification: m.identification_status, reconciliation: m.reconciliation_status, review: m.review_status, matched_invoice_id: m.matched_invoice_id,
    memo: (m.raw as { memo?: string } | null)?.memo ?? null, source: m.source,
  }));
}

export async function getMovement(s: ApiSession, id: string) {
  const sb = serviceClient();
  const { data: m } = await sb.from("movements").select("*").eq("org_id", s.orgId).eq("id", id).maybeSingle();
  if (!m) return null;
  const [{ data: ctx }, { data: proposals }, { data: exceptions }, { data: valuations }, { data: audit }] = await Promise.all([
    sb.from("movement_context_revisions").select("version, counterparty_name, purpose, category, reference, note, created_at").eq("movement_id", id).order("version", { ascending: false }),
    sb.from("match_proposals").select("id, status, signals, differences, rule_version, created_at, invoice:invoices(external_ref, counterparty_name, amount, currency, status)").eq("movement_id", id).order("created_at", { ascending: false }),
    sb.from("exceptions").select("id, kind, status, reason, resolution, created_at, resolved_at").eq("movement_id", id).order("created_at", { ascending: false }),
    sb.from("valuations").select("fiat_amount, currency, source, method, valued_at, version").eq("movement_id", id).order("version", { ascending: false }),
    sb.from("audit_events").select("action, entity, actor_kind, reason, at").eq("org_id", s.orgId).eq("entity_id", id).order("at", { ascending: false }).limit(20),
  ]);
  return {
    id: m.id, signature: m.tx_signature, block_time: m.block_time, direction: m.direction, token: m.token_symbol, token_mint: m.token_mint,
    amount: amount(m.amount_raw, m.token_decimals), amount_raw: m.amount_raw, from: m.from_address, to: m.to_address, source_status: m.source_status,
    identification: m.identification_status, reconciliation: m.reconciliation_status, review: m.review_status, memo: (m.raw as { memo?: string } | null)?.memo ?? null,
    context: ctx ?? [], proposals: proposals ?? [], exceptions: exceptions ?? [], valuations: valuations ?? [], audit: audit ?? [],
  };
}

export async function reconciliationQueue(s: ApiSession, limit = 50) {
  const sb = serviceClient();
  const { data } = await sb.from("match_proposals").select("id, signals, differences, rule_version, created_at, movement:movements(id, block_time, direction, token_symbol, amount_raw, token_decimals), invoice:invoices(id, external_ref, counterparty_name, amount, currency, due_at)").eq("org_id", s.orgId).eq("status", "proposed").order("created_at", { ascending: false }).limit(Math.min(limit, 200));
  return (data ?? []).map((p) => {
    const m = p.movement as unknown as { id: string; block_time: string; direction: string; token_symbol: string; amount_raw: string; token_decimals: number } | null;
    const i = p.invoice as unknown as { id: string; external_ref: string; counterparty_name: string; amount: string; currency: string; due_at: string | null } | null;
    return { proposal_id: p.id, signals: p.signals, differences: p.differences, rule_version: p.rule_version, movement: m ? { id: m.id, block_time: m.block_time, direction: m.direction, amount: amount(m.amount_raw, m.token_decimals), token: m.token_symbol } : null, invoice: i };
  });
}

export async function listExceptions(s: ApiSession, status?: string, limit = 50) {
  const sb = serviceClient();
  let q = sb.from("exceptions").select("id, kind, status, reason, resolution, created_at, resolved_at, assignee:profiles!exceptions_assignee_id_fkey(full_name), movement:movements(id, block_time, direction, token_symbol, amount_raw, token_decimals)").eq("org_id", s.orgId).order("created_at", { ascending: false }).limit(Math.min(limit, 200));
  if (status) q = q.eq("status", status); else q = q.neq("status", "resolved");
  const { data, error } = await q;
  if (error) {
    // the assignee embed name may differ; fall back without it
    const { data: d2 } = await sb.from("exceptions").select("id, kind, status, reason, resolution, created_at, resolved_at, movement:movements(id, block_time, direction, token_symbol, amount_raw, token_decimals)").eq("org_id", s.orgId).neq("status", "resolved").order("created_at", { ascending: false }).limit(Math.min(limit, 200));
    return (d2 ?? []).map(shapeException);
  }
  return (data ?? []).map(shapeException);
}
function shapeException(e: Record<string, unknown>) {
  const m = e.movement as { id: string; block_time: string; direction: string; token_symbol: string; amount_raw: string; token_decimals: number } | null;
  const a = e.assignee as { full_name: string | null } | null | undefined;
  return { id: e.id, kind: e.kind, status: e.status, reason: e.reason, resolution: e.resolution, created_at: e.created_at, resolved_at: e.resolved_at, assignee: a?.full_name ?? null, movement: m ? { id: m.id, block_time: m.block_time, direction: m.direction, amount: amount(m.amount_raw, m.token_decimals), token: m.token_symbol } : null };
}

export async function listWallets(s: ApiSession) {
  const sb = serviceClient();
  const { data } = await sb.from("wallets").select("id, label, address, chain, status, ownership, ownership_evidence, control_verified_at, last_synced_at, last_sync_error, entity:legal_entities(name, tax_id, subject_type)").eq("org_id", s.orgId).order("created_at");
  return (data ?? []).map((w) => {
    const e = w.entity as unknown as { name: string; tax_id: string | null; subject_type: string } | null;
    return { id: w.id, label: w.label, address: w.address, chain: w.chain, status: w.status, entity: e, identity_verified: w.ownership === "verified", control_proven: Boolean(w.control_verified_at), ownership_evidence: w.ownership_evidence, last_synced_at: w.last_synced_at, last_sync_error: w.last_sync_error, verify_url: `https://app.web3rails.io/app/organization/wallets/${w.id}/verify` };
  });
}

export async function listExports(s: ApiSession, limit = 50) {
  const sb = serviceClient();
  const { data } = await sb.from("exports").select("id, period_from, period_to, record_count, schema_version, checksum_sha256, status, created_at, anchor_cluster, anchor_signature, anchored_at, entity:legal_entities(name)").eq("org_id", s.orgId).order("created_at", { ascending: false }).limit(Math.min(limit, 200));
  return (data ?? []).map((e) => ({ ...e, entity: (e.entity as unknown as { name: string } | null)?.name ?? null, explorer_url: e.anchor_signature ? `https://explorer.solana.com/tx/${e.anchor_signature}${e.anchor_cluster === "devnet" ? "?cluster=devnet" : ""}` : null, download_url: `https://app.web3rails.io/app/exports/${e.id}/download` }));
}

export async function walletEvidence(s: ApiSession, walletId: string) {
  const sb = serviceClient();
  const { data } = await sb.from("wallet_ownership_attestations").select("id, method, status, trust_profile, issued_at, decided_at, signer, chain, ocsp, reasons, linked_attestation_id").eq("org_id", s.orgId).eq("wallet_id", walletId).order("issued_at", { ascending: false }).limit(20);
  return data ?? [];
}
