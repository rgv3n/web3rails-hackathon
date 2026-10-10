import type { SupabaseClient } from "@supabase/supabase-js";

export interface Proposal {
  id: string;
  invoice_id: string;
  signals: string[];
  differences: { amount_diff?: string; invoice_amount?: string; movement_amount?: string; days_from_due?: number; tolerance?: string };
  status: string;
  invoice: { external_ref: string; counterparty_name: string; amount: string; currency: string; issued_at: string; due_at: string | null; status: string } | null;
}

export const signalLabel: Record<string, string> = {
  reference_exact: "Reference matches exactly",
  counterparty_known: "Counterparty known",
  amount_compatible: "Amount within tolerance",
  date_window: "Within date window",
};

const SELECT = `id, invoice_id, signals, differences, status,
  invoice:invoices(external_ref, counterparty_name, amount:amount_text, currency, issued_at, due_at, status)`;

export async function proposalsFor(supabase: SupabaseClient, movementId: string, onlyOpen = true): Promise<Proposal[]> {
  let q = supabase.from("match_proposals").select(SELECT).eq("movement_id", movementId).order("created_at", { ascending: false });
  if (onlyOpen) q = q.eq("status", "proposed");
  const { data } = await q;
  return (data ?? []) as unknown as Proposal[];
}

export async function openInvoicesFor(supabase: SupabaseClient, orgId: string, entityId: string, tokenMint: string, kind: "receivable" | "payable") {
  const { data } = await supabase
    .from("invoices")
    .select("id, external_ref, counterparty_name, amount:amount_text, currency, issued_at")
    .eq("org_id", orgId)
    .eq("entity_id", entityId)
    .eq("token_mint", tokenMint)
    .eq("kind", kind)
    .eq("status", "open")
    .is("linked_movement_id", null)
    .order("issued_at", { ascending: false })
    .limit(100);
  return data ?? [];
}
