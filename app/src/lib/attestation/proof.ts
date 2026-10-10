import { createHmac } from "node:crypto";

/** HMAC the database checks before recording a verdict (public.record_wallet_attestation). Same secret lives in Vault. */
export function attestationProof(attestationId: string, verdict: "verified" | "rejected", signerJson: string | null): string {
  const secret = process.env.ATTESTATION_HMAC_SECRET;
  if (!secret) throw new Error("ATTESTATION_HMAC_SECRET is not set");
  return createHmac("sha256", secret).update(`${attestationId}|${verdict}|${signerJson ?? ""}`, "utf8").digest("hex");
}
export const attestationConfigured = () => Boolean(process.env.ATTESTATION_HMAC_SECRET);
