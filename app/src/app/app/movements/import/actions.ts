"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can, requireOrg } from "@/lib/org";
import { parseCsv } from "@/lib/csv";
import { isSolanaAddress, isSolanaSignature } from "@/lib/solana";

import { OPTIONAL, REQUIRED } from "./columns";

export interface PreviewRow {
  n: number;
  values: Record<string, string>;
  errors: string[];
}
export interface ImportState {
  step: "upload" | "preview" | "done";
  filename?: string;
  headers?: string[];
  rows?: PreviewRow[];
  payload?: string; // JSON of valid rows, carried to the commit step
  error?: string;
  result?: { inserted: number; duplicate: number; discrepant: number; errors: { row: number; error: string }[] };
}

function validateRow(v: Record<string, string>, wallets: Set<string>): string[] {
  const e: string[] = [];
  for (const k of REQUIRED) if (!v[k]) e.push(`${k} is required`);
  if (v.tx_signature && !isSolanaSignature(v.tx_signature)) e.push("tx_signature is not a valid Solana signature");
  if (v.from_address && !isSolanaAddress(v.from_address)) e.push("from_address is not a valid address");
  if (v.to_address && !isSolanaAddress(v.to_address)) e.push("to_address is not a valid address");
  if (v.token_mint && !isSolanaAddress(v.token_mint)) e.push("token_mint is not a valid mint");
  if (v.amount_raw && !/^\d{1,39}$/.test(v.amount_raw)) e.push("amount_raw must be an integer in minimal units (no decimals, no float)");
  if (v.token_decimals && !/^\d{1,2}$/.test(v.token_decimals)) e.push("token_decimals must be 0..18");
  if (v.instruction_index && !/^\d+$/.test(v.instruction_index)) e.push("instruction_index must be an integer");
  if (v.block_time && Number.isNaN(Date.parse(v.block_time))) e.push("block_time is not an ISO date");
  if (v.source_status && !["confirmed", "finalized", "failed"].includes(v.source_status)) e.push("source_status must be confirmed, finalized or failed");
  if (v.from_address && v.to_address && !wallets.has(v.from_address) && !wallets.has(v.to_address)) e.push("neither address is a declared wallet of this organization");
  return e;
}

export async function previewImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await requireOrg();
  if (!can(ctx, "import")) return { step: "upload", error: "Your role cannot import movements." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { step: "upload", error: "Choose a CSV file." };
  if (file.size > 2_000_000) return { step: "upload", error: "File larger than 2 MB. Split it." };
  const text = await file.text();
  const { headers, rows } = parseCsv(text);
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) return { step: "upload", error: `Missing columns: ${missing.join(", ")}. Expected: ${[...REQUIRED, ...OPTIONAL].join(", ")}.` };
  if (rows.length === 0) return { step: "upload", error: "The file has a header but no rows." };
  if (rows.length > 2000) return { step: "upload", error: "More than 2,000 rows. Split the file." };

  const supabase = await createClient();
  const { data: ws } = await supabase.from("wallets").select("address").eq("org_id", ctx.org.id).eq("status", "active");
  const wallets = new Set((ws ?? []).map((w) => w.address));

  const preview: PreviewRow[] = rows.map((values, i) => ({ n: i + 1, values, errors: validateRow(values, wallets) }));
  const valid = preview.filter((r) => r.errors.length === 0).map((r) => r.values);
  return { step: "preview", filename: file.name, headers, rows: preview, payload: JSON.stringify(valid) };
}

export async function commitImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await requireOrg();
  if (!can(ctx, "import")) return { step: "upload", error: "Your role cannot import movements." };
  const filename = String(formData.get("filename") ?? "upload.csv");
  let rows: Record<string, string>[];
  try {
    rows = JSON.parse(String(formData.get("payload") ?? "[]"));
  } catch {
    return { step: "upload", error: "Preview payload was corrupted. Upload again." };
  }
  if (rows.length === 0) return { step: "upload", error: "No valid rows to import." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_movements", {
    p_org: ctx.org.id,
    p_filename: filename,
    p_rows: rows,
    p_source: ctx.org.is_demo ? "demo" : "import",
  });
  if (error) return { step: "upload", error: error.message.replace(/^FORBIDDEN:\s*/, "") };
  revalidatePath("/app/movements");
  revalidatePath("/app");
  return { step: "done", filename, result: data as ImportState["result"] };
}
