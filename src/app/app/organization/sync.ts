"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can, requireOrg } from "@/lib/org";
import { fetchHeliusPage, heliusConfigured, mapHeliusTx, type ImportRow, type KnownToken } from "@/lib/helius";

export interface SyncState {
  error?: string;
  ok?: string;
}

const MAX_PAGES = 10; // 10 × 100 txs per run; the next run continues from the cursor

/** Loop A: read from checkpoint → map → idempotent import → advance cursor only after the walk completed. */
export async function syncWallet(_p: SyncState, formData: FormData): Promise<SyncState> {
  const ctx = await requireOrg();
  if (!can(ctx, "import")) return { error: "Your role cannot start a sync." };
  if (!heliusConfigured()) return { error: "Chain sync is not configured: HELIUS_API_KEY is missing on the server. Import movements by CSV meanwhile." };
  const walletId = String(formData.get("wallet_id") ?? "");
  const supabase = await createClient();
  const { data: w } = await supabase.from("wallets").select("id, address, chain, sync_cursor").eq("id", walletId).eq("org_id", ctx.org.id).maybeSingle();
  if (!w) return { error: "Wallet not found." };

  const { data: jobId, error: startErr } = await supabase.rpc("start_sync_job", { p_wallet: walletId });
  if (startErr) return { error: startErr.message.replace(/^(CONFLICT|FORBIDDEN|INVALID|NOT_FOUND):\s*/, "") };

  const { data: toks } = await supabase.from("known_tokens").select("mint, symbol, decimals").eq("chain", "solana");
  const known = new Map<string, KnownToken>((toks ?? []).map((t) => [t.mint, t]));

  let pages = 0, fetched = 0, inserted = 0, duplicate = 0, discrepant = 0;
  const skipped: string[] = [];
  let before: string | undefined;
  let newestSig: string | null = null;
  let status: "finished" | "failed" | "partial" = "finished";
  let errorMsg = "";
  try {
    while (pages < MAX_PAGES) {
      const txs = await fetchHeliusPage(process.env.HELIUS_API_KEY!, w.address, { before, until: w.sync_cursor ?? undefined, limit: 100 });
      pages++;
      if (txs.length === 0) break;
      if (!newestSig) newestSig = txs[0].signature; // Helius returns newest first
      fetched += txs.length;
      const rows: ImportRow[] = [];
      for (const tx of txs) {
        const r = mapHeliusTx(tx, w.address, known);
        rows.push(...r.rows);
        skipped.push(...r.skipped);
      }
      if (rows.length > 0) {
        const { data, error } = await supabase.rpc("import_movements", { p_org: ctx.org.id, p_filename: `helius:${w.address.slice(0, 8)}:${new Date().toISOString()}`, p_rows: rows, p_source: ctx.org.is_demo ? "demo" : "sync" });
        if (error) throw new Error(error.message);
        const d = data as { inserted: number; duplicate: number; discrepant: number; errors: { row: number; error: string }[] };
        inserted += d.inserted; duplicate += d.duplicate; discrepant += d.discrepant;
        skipped.push(...d.errors.map((e) => `import row ${e.row}: ${e.error}`));
      }
      if (txs.length < 100) break;
      before = txs[txs.length - 1].signature;
      if (pages === MAX_PAGES) { status = "partial"; errorMsg = `Stopped after ${MAX_PAGES} pages; run again to continue.`; }
    }
  } catch (e) {
    status = "failed";
    errorMsg = e instanceof Error ? e.message : "Sync failed";
    newestSig = null; // never advance the cursor on failure
  }
  if (status === "partial") newestSig = null; // an incomplete walk must not look complete: keep the old cursor, report progress
  const summary = skipped.length ? `${errorMsg}${errorMsg ? " · " : ""}${skipped.length} change(s) skipped: ${skipped.slice(0, 5).join("; ")}${skipped.length > 5 ? "…" : ""}` : errorMsg;
  await supabase.rpc("finish_sync_job", { p_job: jobId, p_status: status, p_cursor_to: newestSig, p_pages: pages, p_fetched: fetched, p_inserted: inserted, p_duplicate: duplicate, p_discrepant: discrepant, p_skipped: skipped.length, p_error: summary });
  for (const p of ["/app/organization", "/app/movements", "/app"]) revalidatePath(p);
  if (status === "failed") return { error: `Sync failed: ${errorMsg}. The checkpoint was not moved.` };
  return { ok: `${status === "partial" ? "Partial sync" : "Synced"}: ${fetched} transactions read, ${inserted} movements inserted, ${duplicate} already present, ${discrepant} differ${skipped.length ? `, ${skipped.length} skipped` : ""}.` };
}
