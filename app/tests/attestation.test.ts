/**
 * Wallet-ownership attestations (qualified signature). Run against the LOCAL stack with ATTESTATION_HMAC_SECRET in .env.local
 * and the matching Vault secret 'attestation_hmac'. Signatures are produced with openssl from the committed DEMO certificate.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANON, SERVICE, URL } from "./env";
import { verifyCades } from "../src/lib/attestation/verify-cades";
import { verifyWalletSignature } from "../src/lib/attestation/verify-wallet-signature";
import { attestationProof } from "../src/lib/attestation/proof";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
ed.hashes.sha512 = sha512;

// .env.local is not loaded by vitest: read the secret the server would use.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^ATTESTATION_HMAC_SECRET=(.+)$/);
  if (m) process.env.ATTESTATION_HMAC_SECRET = m[1].trim();
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
const PW = "test-password-" + run;
interface Actor { id: string; client: SupabaseClient }
const users: string[] = [];
let org = "", orgDemo = "", walletQualified = "", walletDemo = "";
let adm: Actor, op: Actor;

async function makeUser(label: string): Promise<Actor> {
  const email = `${label}-${run}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { full_name: label } });
  if (error) throw error;
  users.push(data.user.id);
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: PW });
  if (e2) throw e2;
  return { id: data.user.id, client };
}
function extractDemoKeys(dir: string) {
  const p12 = "public/demo-certificate/demo-representative.p12";
  execFileSync("openssl", ["pkcs12", "-in", p12, "-passin", "pass:demo1234", "-nokeys", "-clcerts", "-out", join(dir, "leaf.pem")], { stdio: "pipe" });
  execFileSync("openssl", ["pkcs12", "-in", p12, "-passin", "pass:demo1234", "-nocerts", "-nodes", "-out", join(dir, "leaf.key")], { stdio: "pipe" });
}
const tmp = mkdtempSync(join(tmpdir(), "att-keys-"));
/** CAdES-like CMS (implicit, SHA-256) over `text`, signed with the committed demo certificate. */
const signText = (text: string) => {
  const dir = mkdtempSync(join(tmpdir(), "att-"));
  writeFileSync(join(dir, "c.txt"), text);
  execFileSync("openssl", ["cms", "-sign", "-binary", "-in", join(dir, "c.txt"), "-signer", join(tmp, "leaf.pem"), "-inkey", join(tmp, "leaf.key"), "-md", "sha256", "-outform", "DER", "-out", join(dir, "s.der"), "-nodetach"], { stdio: "pipe" });
  return readFileSync(join(dir, "s.der"));
};

beforeAll(async () => {
  extractDemoKeys(tmp);
  adm = await makeUser("adm");
  op = await makeUser("op");
  org = (await adm.client.rpc("create_organization", { p_name: "Att " + run, p_slug: "att-" + run })).data as string;
  orgDemo = (await adm.client.rpc("create_organization", { p_name: "Att demo " + run, p_slug: "att-demo-" + run })).data as string;
  await admin.from("organizations").update({ is_demo: true }).eq("id", orgDemo);
  await admin.from("memberships").insert([{ org_id: org, user_id: op.id, role: "operator" }]);
  for (const [o, label] of [[org, "q"], [orgDemo, "d"]] as const) {
    const { data: ent } = await admin.from("legal_entities").select("id").eq("org_id", o).single();
    const { data: w } = await admin.from("wallets").insert({ org_id: o, entity_id: ent!.id, chain: "solana", address: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", label }).select("id").single();
    if (label === "q") walletQualified = w!.id; else walletDemo = w!.id;
  }
});
afterAll(async () => {
  for (const o of [org, orgDemo]) await admin.from("organizations").delete().eq("id", o);
  for (const u of users) await admin.auth.admin.deleteUser(u);
});

describe("issuing statements", () => {
  it("admin issues a statement with nonce and the wallet address; operator cannot", async () => {
    const { data, error } = await adm.client.rpc("issue_wallet_attestation", { p_wallet: walletQualified });
    expect(error).toBeNull();
    const st = JSON.parse(data.statement);
    expect(st.wallet).toBe("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
    expect(st.nonce).toHaveLength(24);
    expect(data.trust_profile).toBe("qualified");
    const r2 = await op.client.rpc("issue_wallet_attestation", { p_wallet: walletQualified });
    expect(r2.error?.message).toMatch(/FORBIDDEN/);
    const d = await adm.client.rpc("issue_wallet_attestation", { p_wallet: walletDemo });
    expect(d.data.trust_profile).toBe("demo");
  });
});

describe("verifying signatures", () => {
  it("demo certificate: accepted in a demo organization, rejected in a real one, rejected over altered bytes", async () => {
    const { data: issued } = await adm.client.rpc("issue_wallet_attestation", { p_wallet: walletDemo });
    const sig = signText(issued.statement);
    const ok = await verifyCades({ signatureDer: sig, content: Buffer.from(issued.statement, "utf8"), profile: "demo" });
    expect(ok.verdict).toBe("accepted");
    expect(ok.anchor).toBe("demo");
    expect(ok.signer).toMatchObject({ kind: "company_representative", nif: "IDCES-00000000T", cif: "VATES-B00000000", organization: "ACME DEMO SL" });
    expect(ok.ocsp?.skipped).toMatch(/demo/);
    const real = await verifyCades({ signatureDer: sig, content: Buffer.from(issued.statement, "utf8"), profile: "qualified" });
    expect(real.verdict).toBe("rejected");
    expect(real.reasons.join()).toMatch(/trusted authority/);
    const altered = await verifyCades({ signatureDer: sig, content: Buffer.from(issued.statement + " ", "utf8"), profile: "demo" });
    expect(altered.verdict).toBe("rejected");
    // attached content: the signature is valid over the embedded bytes, but those are not the bytes we issued
    expect(altered.reasons.join()).toMatch(/embedded content differs/);
  });
});

describe("recording verdicts", () => {
  it("a verdict without a valid proof is refused; with the proof the wallet becomes verified; replay is refused", async () => {
    const { data: issued } = await adm.client.rpc("issue_wallet_attestation", { p_wallet: walletDemo });
    const sig = signText(issued.statement);
    const report = await verifyCades({ signatureDer: sig, content: Buffer.from(issued.statement, "utf8"), profile: "demo" });
    const signerJson = JSON.stringify(report.signer);
    const args = { p_id: issued.id, p_verdict: "verified", p_signer_json: signerJson, p_chain: report.chain, p_ocsp: report.ocsp, p_reasons: [], p_signature_b64: sig.toString("base64"), p_certificate_pem: report.certificatePem };
    // forged: right proof for a different signer, or garbage
    const forged = await adm.client.rpc("record_wallet_attestation", { ...args, p_proof: attestationProof(issued.id, "verified", JSON.stringify({ ...report.signer, cif: "VATES-B99999999" })) });
    expect(forged.error?.message).toMatch(/FORBIDDEN: verdict proof/);
    const garbage = await adm.client.rpc("record_wallet_attestation", { ...args, p_proof: "00" });
    expect(garbage.error?.message).toMatch(/FORBIDDEN: verdict proof/);
    const { data: w0 } = await admin.from("wallets").select("ownership").eq("id", walletDemo).single();
    expect(w0!.ownership).toBe("declared");
    // operator with the right proof still cannot record (admin only)
    const byOp = await op.client.rpc("record_wallet_attestation", { ...args, p_proof: attestationProof(issued.id, "verified", signerJson) });
    expect(byOp.error?.message).toMatch(/FORBIDDEN|NOT_FOUND/);
    // genuine
    const ok = await adm.client.rpc("record_wallet_attestation", { ...args, p_proof: attestationProof(issued.id, "verified", signerJson) });
    expect(ok.error).toBeNull();
    const { data: w1 } = await admin.from("wallets").select("ownership, ownership_evidence").eq("id", walletDemo).single();
    expect(w1!.ownership).toBe("verified");
    expect(w1!.ownership_evidence).toBe("attestation:" + issued.id);
    const { data: att } = await admin.from("wallet_ownership_attestations").select("status, signer, reasons").eq("id", issued.id).single();
    expect(att!.status).toBe("verified");
    expect((att!.signer as { cif: string }).cif).toBe("VATES-B00000000");
    const { data: ev } = await admin.from("audit_events").select("action, after").eq("entity_id", walletDemo).eq("action", "ownership_verified");
    expect(ev).toHaveLength(1);
    // replay
    const again = await adm.client.rpc("record_wallet_attestation", { ...args, p_proof: attestationProof(issued.id, "verified", signerJson) });
    expect(again.error?.message).toMatch(/CONFLICT: attestation already verified/);
  });

  it("a rejected verdict is recorded with its reasons and does not touch the wallet", async () => {
    const { data: issued } = await adm.client.rpc("issue_wallet_attestation", { p_wallet: walletQualified });
    const sig = signText(issued.statement);
    const report = await verifyCades({ signatureDer: sig, content: Buffer.from(issued.statement, "utf8"), profile: "qualified" });
    expect(report.verdict).toBe("rejected");
    const signerJson = JSON.stringify(report.signer);
    const r = await adm.client.rpc("record_wallet_attestation", { p_id: issued.id, p_verdict: "rejected", p_proof: attestationProof(issued.id, "rejected", signerJson), p_signer_json: signerJson, p_chain: report.chain, p_ocsp: report.ocsp, p_reasons: report.reasons, p_signature_b64: sig.toString("base64"), p_certificate_pem: report.certificatePem });
    expect(r.error).toBeNull();
    const { data: w } = await admin.from("wallets").select("ownership").eq("id", walletQualified).single();
    expect(w!.ownership).toBe("declared");
    const { data: ev } = await admin.from("audit_events").select("reason").eq("entity_id", walletQualified).eq("action", "ownership_verification_rejected").single();
    expect(ev!.reason).toMatch(/trusted authority/);
  });

  it("an expired statement cannot be recorded", async () => {
    const { data: issued } = await adm.client.rpc("issue_wallet_attestation", { p_wallet: walletQualified });
    await admin.from("wallet_ownership_attestations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", issued.id);
    const r = await adm.client.rpc("record_wallet_attestation", { p_id: issued.id, p_verdict: "verified", p_proof: attestationProof(issued.id, "verified", null), p_signer_json: null, p_chain: null, p_ocsp: null, p_reasons: [], p_signature_b64: null, p_certificate_pem: null });
    expect(r.error).toBeNull();
    expect((r.data as { status: string }).status).toBe("expired");
    const { data: att } = await admin.from("wallet_ownership_attestations").select("status").eq("id", issued.id).single();
    expect(att!.status).toBe("expired");
  });
});

describe("wallet key proof (Phantom signMessage)", () => {
  it("the wallet's own key signs the statement: control proven, identity untouched; a foreign key or altered statement is rejected", async () => {
    const priv = ed.utils.randomSecretKey();
    const address = bs58.encode(ed.getPublicKey(priv));
    const { data: ent } = await admin.from("legal_entities").select("id").eq("org_id", org).single();
    const { data: w } = await admin.from("wallets").insert({ org_id: org, entity_id: ent!.id, chain: "solana", address, label: "phantom" }).select("id").single();
    const { data: issued, error } = await adm.client.rpc("issue_wallet_attestation", { p_wallet: w!.id, p_method: "wallet_key" });
    expect(error).toBeNull();
    expect(issued.method).toBe("wallet_key");
    expect(JSON.parse(issued.statement).method).toBe("wallet_key");
    const sig = ed.sign(new TextEncoder().encode(issued.statement), priv);
    expect(verifyWalletSignature({ address, statement: issued.statement, signature: sig }).verdict).toBe("accepted");
    expect(verifyWalletSignature({ address, statement: issued.statement + " ", signature: sig }).verdict).toBe("rejected");
    const other = bs58.encode(ed.getPublicKey(ed.utils.randomSecretKey()));
    expect(verifyWalletSignature({ address: other, statement: issued.statement, signature: sig }).reasons.join()).toMatch(/does not verify/);
    expect(verifyWalletSignature({ address, statement: issued.statement, signature: sig.slice(0, 63) }).reasons.join()).toMatch(/64 bytes/);
    const signerJson = JSON.stringify({ kind: "wallet_key", wallet: address });
    const r = await adm.client.rpc("record_wallet_attestation", { p_id: issued.id, p_verdict: "verified", p_proof: attestationProof(issued.id, "verified", signerJson), p_signer_json: signerJson, p_chain: null, p_ocsp: null, p_reasons: [], p_signature_b64: Buffer.from(sig).toString("base64"), p_certificate_pem: null });
    expect(r.error).toBeNull();
    const { data: wallet } = await admin.from("wallets").select("ownership, control_verified_at, control_evidence").eq("id", w!.id).single();
    expect(wallet!.ownership).toBe("declared");
    expect(wallet!.control_verified_at).not.toBeNull();
    expect(wallet!.control_evidence).toBe("attestation:" + issued.id);
    const { data: ev } = await admin.from("audit_events").select("action").eq("entity_id", w!.id).eq("action", "control_verified");
    expect(ev).toHaveLength(1);
  });
});
