import type { SupabaseClient } from "@supabase/supabase-js";

export interface MovementRow {
  id: string;
  block_time: string;
  direction: "in" | "out";
  token_symbol: string | null;
  token_mint: string;
  token_decimals: number;
  amount_raw: string;
  tx_signature: string;
  instruction_index: number;
  from_address: string;
  to_address: string;
  source: "import" | "sync" | "demo";
  source_status: string;
  identification_status: "unidentified" | "identified";
  reconciliation_status: string;
  review_status: string;
  context_version: number;
  entity: { id: string; name: string } | null;
  wallet: { id: string; label: string; address: string } | null;
  context: { counterparty_name: string | null; category: string; reference: string | null } | null;
  valuation: { fiat_amount: string; currency: string; source: string } | null;
  open_exceptions: { id: string; kind: string; reason: string; assignee_id: string | null }[];
}

export type MovementFilter = "all" | "needs_review" | "no_invoice" | "discrepancy";

export const filterLabel: Record<MovementFilter, string> = {
  all: "All",
  needs_review: "Needs review",
  no_invoice: "No invoice",
  discrepancy: "Discrepancies",
};

const SELECT = `id, block_time, direction, token_symbol, token_mint, token_decimals, amount_raw:amount_raw_text, tx_signature, instruction_index,
  from_address, to_address, source, source_status, identification_status, reconciliation_status, review_status, context_version,
  entity:legal_entities(id, name), wallet:wallets(id, label, address),
  revisions:movement_context_revisions(version, counterparty_name, category, reference),
  valuations(fiat_amount:fiat_amount_text, currency, source, version),
  exceptions(id, kind, reason, assignee_id, status)`;

type Raw = Omit<MovementRow, "context" | "valuation" | "open_exceptions"> & {
  revisions: { version: number; counterparty_name: string | null; category: string; reference: string | null }[];
  valuations: { fiat_amount: string; currency: string; source: string; version: number }[];
  exceptions: { id: string; kind: string; reason: string; assignee_id: string | null; status: string }[];
};

function shape(r: Raw): MovementRow {
  const { revisions, valuations, exceptions, ...rest } = r;
  const current = revisions.find((x) => x.version === r.context_version) ?? null;
  const val = [...valuations].sort((a, b) => b.version - a.version)[0] ?? null;
  return {
    ...rest,
    amount_raw: String(rest.amount_raw),
    context: current ? { counterparty_name: current.counterparty_name, category: current.category, reference: current.reference } : null,
    valuation: val ? { fiat_amount: String(val.fiat_amount), currency: val.currency, source: val.source } : null,
    open_exceptions: exceptions.filter((e) => e.status !== "resolved").map(({ id, kind, reason, assignee_id }) => ({ id, kind, reason, assignee_id })),
  };
}

export async function listMovements(
  supabase: SupabaseClient,
  orgId: string,
  params: { filter?: MovementFilter; entity?: string; wallet?: string; from?: string; to?: string; q?: string; limit?: number },
): Promise<MovementRow[]> {
  let q = supabase.from("movements").select(SELECT).eq("org_id", orgId).order("block_time", { ascending: false }).limit(params.limit ?? 200);
  if (params.entity) q = q.eq("entity_id", params.entity);
  if (params.wallet) q = q.eq("wallet_id", params.wallet);
  if (params.from) q = q.gte("block_time", params.from);
  if (params.to) q = q.lte("block_time", params.to + "T23:59:59Z");
  if (params.q) q = q.or(`tx_signature.ilike.%${params.q}%,from_address.ilike.%${params.q}%,to_address.ilike.%${params.q}%`);
  if (params.filter === "needs_review") q = q.neq("review_status", "approved");
  if (params.filter === "no_invoice") q = q.eq("reconciliation_status", "unmatched");
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data as unknown as Raw[]).map(shape);
  if (params.filter === "discrepancy") rows = rows.filter((r) => r.open_exceptions.some((e) => e.kind === "import_discrepancy"));
  if (params.filter === "needs_review") rows = rows.filter((r) => r.identification_status === "unidentified" || r.open_exceptions.length > 0 || r.review_status !== "approved");
  return rows;
}

export async function getMovement(supabase: SupabaseClient, orgId: string, id: string): Promise<MovementRow | null> {
  const { data, error } = await supabase.from("movements").select(SELECT).eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? shape(data as unknown as Raw) : null;
}

/** Human reason this row needs attention, or null. */
export function attentionReason(r: MovementRow): string | null {
  const disc = r.open_exceptions.find((e) => e.kind === "import_discrepancy");
  if (disc) return "Re-import differs from stored record";
  if (r.open_exceptions[0]) return r.open_exceptions[0].reason;
  if (r.identification_status === "unidentified") return "Financial context missing";
  if (r.reconciliation_status === "unmatched") return "No invoice linked";
  return null;
}

export const categoryLabel: Record<string, string> = {
  unknown: "Unknown",
  customer_payment: "Customer payment",
  vendor_payment: "Vendor payment",
  internal_transfer: "Internal transfer",
  fee: "Fee",
  refund: "Refund",
  treasury: "Treasury",
  other: "Other",
};
export const reviewLabel: Record<string, string> = { pending: "Pending", correction_requested: "Correction requested", approved: "Approved" };
export const reconLabel: Record<string, string> = { unmatched: "Unmatched", proposed: "Proposed", matched: "Matched", not_applicable: "Not applicable" };
