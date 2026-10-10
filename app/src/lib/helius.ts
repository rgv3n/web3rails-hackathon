/**
 * Helius Enhanced Transactions adapter (read-only). Maps token balance changes of KNOWN stablecoin mints
 * into import rows for `import_movements`. Amounts come from `rawTokenAmount` (integer string), never from floats.
 * Docs: GET https://api.helius.xyz/v0/addresses/{address}/transactions?api-key=…&limit=100&before=…&until=…
 */
import { isSolanaAddress, isSolanaSignature } from "@/lib/solana";

export interface HeliusTokenBalanceChange {
  userAccount: string;
  tokenAccount: string;
  mint: string;
  rawTokenAmount: { tokenAmount: string; decimals: number };
}
export interface HeliusTokenTransfer {
  fromUserAccount: string | null;
  toUserAccount: string | null;
  mint: string;
  tokenAmount: number;
}
export interface HeliusTx {
  signature: string;
  timestamp: number; // unix seconds
  transactionError: unknown | null;
  accountData?: { account: string; tokenBalanceChanges?: HeliusTokenBalanceChange[] }[];
  tokenTransfers?: HeliusTokenTransfer[];
}

export interface ImportRow {
  tx_signature: string;
  instruction_index: string;
  block_time: string;
  from_address: string;
  to_address: string;
  token_mint: string;
  token_symbol: string;
  token_decimals: string;
  amount_raw: string;
  source_status: string;
  source_ref: string;
}

export interface KnownToken { mint: string; symbol: string; decimals: number }

/** Pure mapper: one Helius tx → zero or more import rows for `wallet`. Unmappable changes are reported, not guessed. */
export function mapHeliusTx(tx: HeliusTx, wallet: string, known: Map<string, KnownToken>): { rows: ImportRow[]; skipped: string[] } {
  const rows: ImportRow[] = [];
  const skipped: string[] = [];
  if (!isSolanaSignature(tx.signature)) return { rows, skipped: [`invalid signature ${tx.signature}`] };
  const blockTime = new Date(tx.timestamp * 1000).toISOString();
  const status = tx.transactionError ? "failed" : "finalized";
  const changes = (tx.accountData ?? []).flatMap((a) => a.tokenBalanceChanges ?? []).filter((c) => known.has(c.mint));
  const mine = changes.filter((c) => c.userAccount === wallet);
  let idx = 0;
  for (const c of mine) {
    const token = known.get(c.mint)!;
    const raw = c.rawTokenAmount.tokenAmount;
    if (!/^-?\d+$/.test(raw) || raw === "0") { skipped.push(`${tx.signature}: non-integer or zero raw amount`); continue; }
    const outgoing = raw.startsWith("-");
    const abs = raw.replace(/^-/, "");
    // counterparty = the single opposite-signed change of the same mint in this tx; else the tokenTransfers entry; else skip
    const opposite = changes.filter((o) => o.mint === c.mint && o.userAccount !== wallet && (o.rawTokenAmount.tokenAmount.startsWith("-") !== outgoing));
    let other: string | null = opposite.length === 1 ? opposite[0].userAccount : null;
    if (!other) {
      const t = (tx.tokenTransfers ?? []).find((t) => t.mint === c.mint && (outgoing ? t.fromUserAccount === wallet : t.toUserAccount === wallet));
      other = outgoing ? (t?.toUserAccount ?? null) : (t?.fromUserAccount ?? null);
    }
    if (!other || !isSolanaAddress(other)) { skipped.push(`${tx.signature}: counterparty address not determinable for ${token.symbol}`); continue; }
    if (c.rawTokenAmount.decimals !== token.decimals) { skipped.push(`${tx.signature}: decimals ${c.rawTokenAmount.decimals} differ from known ${token.decimals}`); continue; }
    rows.push({
      tx_signature: tx.signature,
      instruction_index: String(idx++),
      block_time: blockTime,
      from_address: outgoing ? wallet : other,
      to_address: outgoing ? other : wallet,
      token_mint: c.mint,
      token_symbol: token.symbol,
      token_decimals: String(token.decimals),
      amount_raw: abs,
      source_status: status,
      source_ref: `helius:${tx.signature}`,
    });
  }
  return { rows, skipped };
}

export interface FetchPageResult { txs: HeliusTx[]; status: number }

/** Bounded fetch with retries on 429/5xx. Throws after `retries` attempts. */
export async function fetchHeliusPage(apiKey: string, address: string, opts: { before?: string; until?: string; limit?: number; retries?: number; timeoutMs?: number } = {}): Promise<HeliusTx[]> {
  const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("limit", String(opts.limit ?? 100));
  if (opts.before) url.searchParams.set("before", opts.before);
  if (opts.until) url.searchParams.set("until", opts.until);
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) throw new Error(`Helius HTTP ${res.status}`);
      if (!res.ok) { const body = await res.text(); throw Object.assign(new Error(`Helius HTTP ${res.status}: ${body.slice(0, 200)}`), { fatal: true }); }
      return (await res.json()) as HeliusTx[];
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) throw e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Helius request failed");
}

export function heliusConfigured() {
  return Boolean(process.env.HELIUS_API_KEY);
}
