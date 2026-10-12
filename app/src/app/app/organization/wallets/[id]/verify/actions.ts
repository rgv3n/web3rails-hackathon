"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can, requireOrg } from "@/lib/org";
import { closeSasAttestation, publishSasAttestation, sasConfigured } from "@/lib/sas";
import { assertNoPersonalData, buildSasFields, expiryFromSigner, type SignerIdentity } from "@/lib/sas-fields";

export interface SasState { error?: string; ok?: string }

const clean = (m: string) => m.replace(/^(FORBIDDEN|INVALID|CONFLICT):\s*/, "");

/** Admin switches the public-attestation opt-in of a wallet. */
export async function setSasOptIn(_p: SasState, formData: FormData): Promise<SasState> {
  const ctx = await requireOrg();
  if (!can(ctx, "manage_org")) return { error: "Only admins can change this." };
  const walletId = String(formData.get("wallet_id") ?? "");
  const optIn = formData.get("opt_in") === "on";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_wallet_sas_opt_in", { p_wallet: walletId, p_opt_in: optIn });
  if (error) return { error: clean(error.message) };
  revalidatePath(`/app/organization/wallets/${walletId}/verify`);
  return { ok: optIn ? "Opted in. You can publish the attestation now." : "Opted out. Nothing is published for this wallet." };
}

/** Publishes the five-field attestation on Solana for a verified certificate signature. Admin, opt-in required. */
export async function publishSas(_p: SasState, formData: FormData): Promise<SasState> {
  const ctx = await requireOrg();
  if (!can(ctx, "manage_org")) return { error: "Only admins can publish." };
  if (!sasConfigured()) return { error: "Public attestations are not enabled on this server." };
  const attestationId = String(formData.get("attestation_id") ?? "");
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("wallet_ownership_attestations")
    .select("id, org_id, wallet_id, status, method, trust_profile, statement, signer, chain, wallet:wallets(id, address, sas_opt_in, entity:legal_entities(subject_type))")
    .eq("id", attestationId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!a) return { error: "Attestation not found." };
  if (a.status !== "verified" || a.method !== "certificate") return { error: "Only a verified certificate signature can be published." };
  const wallet = a.wallet as unknown as { id: string; address: string; sas_opt_in: boolean; entity: { subject_type: "legal_entity" | "natural_person" } | null } | null;
  if (!wallet) return { error: "Wallet not found." };
  if (!wallet.sas_opt_in) return { error: "This wallet has not opted in." };
  const signer = (a.signer ?? {}) as SignerIdentity;
  const { data: linkedRow } = await supabase
    .from("wallet_ownership_attestations")
    .select("id")
    .eq("linked_attestation_id", a.id)
    .eq("status", "verified")
    .eq("method", "wallet_key")
    .limit(1)
    .maybeSingle();
  let fields, expiry: number;
  try {
    fields = buildSasFields({ address: wallet.address, subjectType: wallet.entity?.subject_type ?? "legal_entity", chain: a.chain as string[] | null, trustProfile: a.trust_profile, statement: a.statement, linked: Boolean(linkedRow) });
    assertNoPersonalData(fields, signer);
    expiry = expiryFromSigner(signer.notAfter);
  } catch (err) {
    return { error: (err as Error).message };
  }
  let published: Awaited<ReturnType<typeof publishSasAttestation>>;
  try {
    published = await publishSasAttestation(fields, expiry);
  } catch (err) {
    return { error: `Solana: ${(err as Error).message}` };
  }
  const { error } = await supabase.rpc("record_sas_attestation", {
    p_attestation: a.id,
    p_cluster: published.cluster,
    p_credential: published.credentialPda,
    p_schema: published.schemaPda,
    p_pda: published.attestationPda,
    p_signature: published.signature,
    p_fields: fields,
    p_expiry: new Date(expiry * 1000).toISOString(),
  });
  if (error) return { error: `${clean(error.message)} (the on-chain account ${published.attestationPda} was created; transaction ${published.signature})` };
  revalidatePath(`/app/organization/wallets/${wallet.id}/verify`);
  return { ok: `Published on Solana ${published.cluster}: ${published.attestationPda.slice(0, 12)}…` };
}

/** Closes the on-chain attestation and records it. Admin. */
export async function closeSas(_p: SasState, formData: FormData): Promise<SasState> {
  const ctx = await requireOrg();
  if (!can(ctx, "manage_org")) return { error: "Only admins can close an attestation." };
  if (!sasConfigured()) return { error: "Public attestations are not enabled on this server." };
  const id = String(formData.get("sas_id") ?? "");
  const supabase = await createClient();
  const { data: s } = await supabase.from("sas_attestations").select("id, wallet_id, attestation_pda, status").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  if (!s) return { error: "Not found." };
  if (s.status !== "published") return { error: "Not published." };
  let signature: string;
  try {
    ({ signature } = await closeSasAttestation(s.attestation_pda));
  } catch (err) {
    return { error: `Solana: ${(err as Error).message}` };
  }
  const { error } = await supabase.rpc("record_sas_close", { p_id: s.id, p_signature: signature });
  if (error) return { error: `${clean(error.message)} (the on-chain account was closed; transaction ${signature})` };
  revalidatePath(`/app/organization/wallets/${s.wallet_id}/verify`);
  return { ok: "Attestation closed. The on-chain account no longer exists." };
}
