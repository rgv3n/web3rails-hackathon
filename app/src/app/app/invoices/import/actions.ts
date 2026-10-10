"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can, requireOrg } from "@/lib/org";
import { parseCsv } from "@/lib/csv";
import { INVOICE_OPTIONAL, INVOICE_REQUIRED } from "./columns";
import type { ImportState, PreviewRow } from "../../movements/import/actions";

function validate(v: Record<string, string>, entities: Set<string>, knownCurrencies: Set<string>): string[] {
  const e: string[] = [];
  for (const k of INVOICE_REQUIRED) if (!v[k]) e.push(`${k} is required`);
  if (v.kind && !["receivable", "payable"].includes(v.kind.toLowerCase())) e.push("kind must be receivable or payable");
  if (v.amount && !/^\d+(\.\d{1,8})?$/.test(v.amount)) e.push("amount must be a positive decimal (dot, up to 8 places)");
  if (v.issued_at && Number.isNaN(Date.parse(v.issued_at))) e.push("issued_at is not a date");
  if (v.due_at && Number.isNaN(Date.parse(v.due_at))) e.push("due_at is not a date");
  if (v.entity_name && !entities.has(v.entity_name)) e.push(`unknown entity_name “${v.entity_name}”`);
  if (v.currency && !knownCurrencies.has(v.currency.toUpperCase())) e.push(`currency ${v.currency} is not a known stablecoin: the invoice will import but cannot be matched until a conversion exists`);
  return e.filter((m) => !m.startsWith("currency ")); // fiat currencies are allowed; the note is informational only
}

export async function previewInvoiceImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await requireOrg();
  if (!can(ctx, "import")) return { step: "upload", error: "Your role cannot import invoices." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { step: "upload", error: "Choose a CSV file." };
  if (file.size > 2_000_000) return { step: "upload", error: "File larger than 2 MB. Split it." };
  const { headers, rows } = parseCsv(await file.text());
  const missing = INVOICE_REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) return { step: "upload", error: `Missing columns: ${missing.join(", ")}. Expected: ${[...INVOICE_REQUIRED, ...INVOICE_OPTIONAL].join(", ")}.` };
  if (rows.length === 0) return { step: "upload", error: "The file has a header but no rows." };
  if (rows.length > 2000) return { step: "upload", error: "More than 2,000 rows. Split the file." };
  const supabase = await createClient();
  const [{ data: ents }, { data: toks }] = await Promise.all([
    supabase.from("legal_entities").select("name").eq("org_id", ctx.org.id),
    supabase.from("known_tokens").select("symbol"),
  ]);
  const entities = new Set((ents ?? []).map((x) => x.name));
  const known = new Set((toks ?? []).map((x) => x.symbol));
  const preview: PreviewRow[] = rows.map((values, i) => ({ n: i + 1, values, errors: validate(values, entities, known) }));
  const valid = preview.filter((r) => r.errors.length === 0).map((r) => r.values);
  return { step: "preview", filename: file.name, headers, rows: preview, payload: JSON.stringify(valid) };
}

export async function commitInvoiceImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await requireOrg();
  if (!can(ctx, "import")) return { step: "upload", error: "Your role cannot import invoices." };
  const filename = String(formData.get("filename") ?? "invoices.csv");
  let rows: Record<string, string>[];
  try {
    rows = JSON.parse(String(formData.get("payload") ?? "[]"));
  } catch {
    return { step: "upload", error: "Preview payload was corrupted. Upload again." };
  }
  if (rows.length === 0) return { step: "upload", error: "No valid rows to import." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_invoices", { p_org: ctx.org.id, p_filename: filename, p_rows: rows });
  if (error) return { step: "upload", error: error.message.replace(/^FORBIDDEN:\s*/, "") };
  revalidatePath("/app/invoices");
  revalidatePath("/app/reconciliation");
  revalidatePath("/app/movements");
  revalidatePath("/app");
  return { step: "done", filename, result: data as ImportState["result"] };
}
