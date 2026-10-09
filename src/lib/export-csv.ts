import { createHash } from "node:crypto";

/** Column order is the documented schema v1. Changing it means a new schema_version. */
export const EXPORT_COLUMNS_V1 = [
  "movement_id", "block_time", "entity", "wallet", "direction", "network", "tx_signature", "instruction_index",
  "token_symbol", "token_mint", "amount", "amount_raw", "token_decimals",
  "counterparty", "category", "purpose", "reference",
  "invoice_ref", "invoice_amount", "invoice_currency", "fiat_value", "fiat_currency",
  "context_version", "approved_by", "approved_at", "evidence",
] as const;

const NUMERIC = new Set(["amount", "amount_raw", "token_decimals", "instruction_index", "invoice_amount", "fiat_value", "context_version"]);

/** Spreadsheet formula injection: text starting with = + - @ (or tab/CR) gets a leading apostrophe. Numeric columns are never altered. */
export function neutralize(value: string, column: string): string {
  if (NUMERIC.has(column)) return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  const header = EXPORT_COLUMNS_V1.join(",");
  const lines = rows.map((r) => EXPORT_COLUMNS_V1.map((c) => cell(neutralize(String(r[c] ?? ""), c))).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}

export function sha256(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
