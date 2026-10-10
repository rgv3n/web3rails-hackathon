/**
 * Second proof: the wallet's own ed25519 key (Phantom `signMessage`, or any Solana wallet) signs the issued statement.
 * Proves control of the private key behind the address; it says nothing about who the holder is legally.
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";

ed.hashes.sha512 = sha512;

export interface WalletSignatureReport {
  verdict: "accepted" | "rejected";
  reasons: string[];
  wallet: string;
}

export function verifyWalletSignature(input: { address: string; statement: string; signature: Uint8Array }): WalletSignatureReport {
  const report: WalletSignatureReport = { verdict: "rejected", reasons: [], wallet: input.address };
  let pub: Uint8Array;
  try {
    pub = bs58.decode(input.address);
    if (pub.length !== 32) throw new Error("not 32 bytes");
  } catch (e) {
    report.reasons.push(`wallet address is not a valid ed25519 public key: ${(e as Error).message}`);
    return report;
  }
  if (input.signature.length !== 64) {
    report.reasons.push(`signature must be 64 bytes, got ${input.signature.length}`);
    return report;
  }
  let ok = false;
  try {
    ok = ed.verify(input.signature, new TextEncoder().encode(input.statement), pub);
  } catch (e) {
    report.reasons.push(`signature check failed: ${(e as Error).message}`);
    return report;
  }
  if (!ok) report.reasons.push("signature does not verify over the issued statement with this wallet's key");
  report.verdict = report.reasons.length === 0 ? "accepted" : "rejected";
  return report;
}
