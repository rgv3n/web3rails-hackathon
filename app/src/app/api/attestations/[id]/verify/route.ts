import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCades, type TrustProfile } from "@/lib/attestation/verify-cades";
import { attestationProof } from "@/lib/attestation/proof";
import { checkSignerPolicy, type EntityIdentity } from "@/lib/attestation/policy";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST { signatureB64 } → verifies the CAdES signature over the issued statement and records the verdict. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { signatureB64?: string };
  if (!body.signatureB64 || body.signatureB64.length > 400_000) return NextResponse.json({ error: "signatureB64 required" }, { status: 400 });

  const { data: att } = await supabase.from("wallet_ownership_attestations").select("id, statement, trust_profile, status, method, expires_at, wallet:wallets(entity:legal_entities(name, tax_id, subject_type))").eq("id", id).maybeSingle();
  if (!att) return NextResponse.json({ error: "Attestation not found" }, { status: 404 });
  if (att.method !== "certificate") return NextResponse.json({ error: "This statement was issued for a wallet-key signature" }, { status: 400 });
  if (att.status !== "issued") return NextResponse.json({ error: `Attestation already ${att.status}` }, { status: 409 });

  let signatureDer: Buffer;
  try {
    signatureDer = Buffer.from(body.signatureB64, "base64");
  } catch {
    return NextResponse.json({ error: "signatureB64 is not base64" }, { status: 400 });
  }
  const report = await verifyCades({ signatureDer, content: Buffer.from(att.statement, "utf8"), profile: att.trust_profile as TrustProfile });
  // Cryptography done; now the policy: is this certificate the right one for this entity?
  const entity = (att.wallet as unknown as { entity: EntityIdentity | null } | null)?.entity ?? null;
  if (report.verdict === "accepted" && report.signer) {
    const policy = entity ? checkSignerPolicy(report.signer, entity) : ["wallet has no legal entity"];
    if (policy.length) {
      report.reasons.push(...policy);
      report.verdict = "rejected";
    }
  }
  const verdict = report.verdict === "accepted" ? "verified" : "rejected";
  const signerJson = report.signer ? JSON.stringify(report.signer) : null;
  const { data: recorded, error } = await supabase.rpc("record_wallet_attestation", {
    p_id: id,
    p_verdict: verdict,
    p_proof: attestationProof(id, verdict, signerJson),
    p_signer_json: signerJson,
    p_chain: report.chain,
    p_ocsp: report.ocsp,
    p_reasons: report.reasons,
    p_signature_b64: body.signatureB64,
    p_certificate_pem: report.certificatePem,
    p_ocsp_der: report.ocspResponseB64,
  });
  if (error) {
    const status = error.message.startsWith("FORBIDDEN") ? 403 : error.message.startsWith("CONFLICT") ? 409 : 500;
    return NextResponse.json({ error: error.message, report }, { status });
  }
  if ((recorded as { status?: string } | null)?.status === "expired") return NextResponse.json({ error: "The statement expired; issue a new one.", report }, { status: 410 });
  return NextResponse.json({ status: verdict, report });
}
