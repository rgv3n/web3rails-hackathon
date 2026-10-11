/**
 * Writes a memo transaction on Solana from the Web3Rails anchor key. The only on-chain writes the product makes:
 *   - export anchors: "web3rails:export:<id>:<sha256>" (no personal data)
 * Env: SOLANA_ANCHOR_SECRET_KEY (base58 of the 64-byte secret key; server only), SOLANA_RPC_URL (default devnet),
 *      SOLANA_CLUSTER ("devnet" | "mainnet-beta", default devnet).
 */
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function anchorConfigured() {
  return Boolean(process.env.SOLANA_ANCHOR_SECRET_KEY);
}
export function anchorCluster(): "devnet" | "mainnet-beta" {
  return process.env.SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";
}
export function anchorRpcUrl() {
  return process.env.SOLANA_RPC_URL ?? (anchorCluster() === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");
}
export function anchorKeypair(): Keypair {
  const secret = process.env.SOLANA_ANCHOR_SECRET_KEY;
  if (!secret) throw new Error("SOLANA_ANCHOR_SECRET_KEY is not set");
  return Keypair.fromSecretKey(bs58.decode(secret));
}
export function exportMemo(exportId: string, checksumSha256: string) {
  return `web3rails:export:${exportId}:${checksumSha256}`;
}
export function explorerTxUrl(signature: string, cluster = anchorCluster()) {
  return `https://explorer.solana.com/tx/${signature}${cluster === "devnet" ? "?cluster=devnet" : ""}`;
}

/** Sends a memo-only transaction and waits for confirmation. Returns the signature. */
export async function anchorMemo(memo: string): Promise<{ signature: string; cluster: "devnet" | "mainnet-beta"; payer: string }> {
  const payer = anchorKeypair();
  const connection = new Connection(anchorRpcUrl(), "confirmed");
  const ix = new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }], data: Buffer.from(memo, "utf8") });
  // a zero-lamport self transfer is not needed; the memo instruction alone is a valid transaction
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  const signature = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
  void SystemProgram;
  return { signature, cluster: anchorCluster(), payer: payer.publicKey.toBase58() };
}
