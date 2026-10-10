import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyWalletSignature } from "@/lib/attestation/verify-wallet-signature";
import { attestationProof } from "@/lib/attestation/proof";

export const runtime = "nodejs";

/** POST { signatureB64 } → verifies the wallet key's ed25519 signature over the issued statement and records the verdict. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { signatureB64?: string };
  if (!body.signatureB64 || body.signatureB64.length > 1000) return NextResponse.json({ error: "signatureB64 required" }, { status: 400 });

  const { data: att } = await supabase.from("wallet_ownership_attestations").select("id, statement, method, status, wallet:wallets(address)").eq("id", id).maybeSingle();
  if (!att) return NextResponse.json({ error: "Attestation not found" }, { status: 404 });
  if (att.method !== "wallet_key") return NextResponse.json({ error: "This statement was issued for a certificate signature" }, { status: 400 });
  if (att.status !== "issued") return NextResponse.json({ error: `Attestation already ${att.status}` }, { status: 409 });
  const wallet = att.wallet as unknown as { address: string } | null;
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const report = verifyWalletSignature({ address: wallet.address, statement: att.statement, signature: Buffer.from(body.signatureB64, "base64") });
  const verdict = report.verdict === "accepted" ? "verified" : "rejected";
  const signerJson = JSON.stringify({ kind: "wallet_key", wallet: wallet.address });
  const { data: recorded, error } = await supabase.rpc("record_wallet_attestation", {
    p_id: id,
    p_verdict: verdict,
    p_proof: attestationProof(id, verdict, signerJson),
    p_signer_json: signerJson,
    p_chain: null,
    p_ocsp: null,
    p_reasons: report.reasons,
    p_signature_b64: body.signatureB64,
    p_certificate_pem: null,
  });
  if (error) {
    const status = error.message.startsWith("FORBIDDEN") ? 403 : error.message.startsWith("CONFLICT") ? 409 : 500;
    return NextResponse.json({ error: error.message, report }, { status });
  }
  if ((recorded as { status?: string } | null)?.status === "expired") return NextResponse.json({ error: "The statement expired; issue a new one.", report }, { status: 410 });
  return NextResponse.json({ status: verdict, report });
}
