import { describe, expect, it } from "vitest";
import { extractMemo, mapHeliusTx, type HeliusTx, type KnownToken } from "../src/lib/helius";
import bs58 from "bs58";

const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const OTHER = "7Zb1bGi32pfsrBkzWdqd4dFhUXvkCe4b9NYSfx9GVkDT";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SIG = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const known = new Map<string, KnownToken>([[USDC, { mint: USDC, symbol: "USDC", decimals: 6 }]]);

const tx = (changes: { user: string; raw: string; mint?: string; decimals?: number }[], extra: Partial<HeliusTx> = {}): HeliusTx => ({
  signature: SIG,
  timestamp: 1790000000,
  transactionError: null,
  accountData: changes.map((c) => ({ account: c.user, tokenBalanceChanges: [{ userAccount: c.user, tokenAccount: "x", mint: c.mint ?? USDC, rawTokenAmount: { tokenAmount: c.raw, decimals: c.decimals ?? 6 } }] })),
  ...extra,
});

describe("Helius mapper (exact amounts, no guessing)", () => {
  it("maps an incoming transfer from raw integer amounts", () => {
    const { rows, skipped } = mapHeliusTx(tx([{ user: OTHER, raw: "-4250000000" }, { user: WALLET, raw: "4250000000" }]), WALLET, known);
    expect(skipped).toEqual([]);
    expect(rows).toEqual([expect.objectContaining({ tx_signature: SIG, from_address: OTHER, to_address: WALLET, amount_raw: "4250000000", token_decimals: "6", source_status: "finalized", block_time: "2026-09-21T14:13:20.000Z" })]);
  });
  it("maps an outgoing transfer and marks failed transactions", () => {
    const { rows } = mapHeliusTx(tx([{ user: WALLET, raw: "-1840000000" }, { user: OTHER, raw: "1840000000" }], { transactionError: { err: "x" } }), WALLET, known);
    expect(rows[0]).toMatchObject({ from_address: WALLET, to_address: OTHER, amount_raw: "1840000000", source_status: "failed" });
  });
  it("ignores unknown mints and never invents a counterparty", () => {
    const r1 = mapHeliusTx(tx([{ user: WALLET, raw: "5", mint: "So11111111111111111111111111111111111111112" }]), WALLET, known);
    expect(r1.rows).toEqual([]);
    const r2 = mapHeliusTx(tx([{ user: WALLET, raw: "100" }]), WALLET, known); // no opposite change, no tokenTransfers
    expect(r2.rows).toEqual([]);
    expect(r2.skipped[0]).toMatch(/counterparty address not determinable/);
  });
  it("falls back to tokenTransfers when several opposite changes exist, and skips decimal mismatches", () => {
    const ambiguous = tx([{ user: WALLET, raw: "300" }, { user: OTHER, raw: "-100" }, { user: "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T", raw: "-200" }], {
      tokenTransfers: [{ fromUserAccount: OTHER, toUserAccount: WALLET, mint: USDC, tokenAmount: 0.0003 }],
    });
    expect(mapHeliusTx(ambiguous, WALLET, known).rows[0]).toMatchObject({ from_address: OTHER, amount_raw: "300" });
    const bad = mapHeliusTx(tx([{ user: WALLET, raw: "1", decimals: 9 }, { user: OTHER, raw: "-1", decimals: 9 }]), WALLET, known);
    expect(bad.rows).toEqual([]);
    expect(bad.skipped[0]).toMatch(/decimals/);
  });
});

describe("memo / payment reference (Solana Pay convention)", () => {
  const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
  it("reads the memo program data (base58 or plain) and carries it on the row", () => {
    const b58 = bs58.encode(Buffer.from("INV-291")); // Helius gives instruction data base58-encoded
    const t = tx([{ user: OTHER, raw: "-100" }, { user: WALLET, raw: "100" }], { instructions: [{ programId: "11111111111111111111111111111111", data: "x" }, { programId: MEMO, data: b58 }] });
    expect(extractMemo(t)).toBe("INV-291");
    expect(mapHeliusTx(t, WALLET, known).rows[0]).toMatchObject({ memo: "INV-291" });
    expect(extractMemo(tx([], { instructions: [{ programId: MEMO, data: "plain text memo" }] }))).toBe("plain text memo");
    expect(extractMemo(tx([], { instructions: [] }))).toBeNull();
    expect(mapHeliusTx(tx([{ user: OTHER, raw: "-100" }, { user: WALLET, raw: "100" }]), WALLET, known).rows[0]).not.toHaveProperty("memo");
  });
});
