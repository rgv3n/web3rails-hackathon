/**
 * Public attestations (Solana Attestation Service): what may be published and who may publish it.
 * Database rules against the LOCAL stack (no chain: the on-chain write is simulated with fake PDAs/signatures) + the pure field rules.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANON, SERVICE, URL } from "./env";
import { verifyCades } from "../src/lib/attestation/verify-cades";
import { attestationProof } from "../src/lib/attestation/proof";
import { assertNoPersonalData, buildSasFields, expiryFromSigner, issuerFromChain, SAS_FIELD_NAMES } from "../src/lib/sas-fields";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^ATTESTATION_HMAC_SECRET=(.+)$/);
  if (m) process.env.ATTESTATION_HMAC_SECRET = m[1].trim();
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
const PW = "test-password-" + run;
interface Actor { id: string; client: SupabaseClient }
const users: string[] = [];
let org = "", wallet = "", adm: Actor, op: Actor;
const ADDRESS = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

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
const tmp = mkdtempSync(join(tmpdir(), "sas-keys-"));
function extractDemoKeys() {
  const p12 = "public/demo-certificate/demo-representative.p12";
  execFileSync("openssl", ["pkcs12", "-in", p12, "-passin", "pass:demo1234", "-nokeys", "-clcerts", "-out", join(tmp, "leaf.pem")], { stdio: "pipe" });
  execFileSync("openssl", ["pkcs12", "-in", p12, "-passin", "pass:demo1234", "-nocerts", "-nodes", "-out", join(tmp, "leaf.key")], { stdio: "pipe" });
}
const signText = (text: string) => {
  const dir = mkdtempSync(join(tmpdir(), "sas-"));
  writeFileSync(join(dir, "c.txt"), text);
  execFileSync("openssl", ["cms", "-sign", "-binary", "-in", join(dir, "c.txt"), "-signer", join(tmp, "leaf.pem"), "-inkey", join(tmp, "leaf.key"), "-md", "sha256", "-outform", "DER", "-out", join(dir, "s.der"), "-nodetach"], { stdio: "pipe" });
  return readFileSync(join(dir, "s.der"));
};

const fakeChain = { p_cluster: "devnet", p_credential: "Cred1111111111111111111111111111111111111111", p_schema: "Schm1111111111111111111111111111111111111111", p_pda: "Attn1111111111111111111111111111111111111111", p_signature: "5igNature" + run };

describe("sas fields (pure)", () => {
  const signer = { nif: "IDCES-00000000T", cif: "VATES-B00000000", commonName: "00000000T MARIA EJEMPLO (R: B00000000)", givenName: "MARIA", surname: "EJEMPLO", organization: "EMPRESA EJEMPLO SL", serial: "01", notAfter: "2030-01-01T00:00:00.000Z" };
  it("builds exactly the five agreed fields and nothing from the certificate identity", () => {
    const f = buildSasFields({ address: ADDRESS, subjectType: "legal_entity", chain: ["X", "AC Representación", "AC RAIZ FNMT-RCM"], trustProfile: "qualified", statement: '{"v":2,"wallet":"' + ADDRESS + '"}', linked: true });
    expect(Object.keys(f).sort()).toEqual([...SAS_FIELD_NAMES].sort());
    expect(f).toMatchObject({ wallet: ADDRESS, subject_type: "legal_entity", level: "qualified_linked", issuer: "FNMT" });
    expect(f.statement_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() => assertNoPersonalData(f, signer)).not.toThrow();
    expect(JSON.stringify(f)).not.toMatch(/MARIA|EJEMPLO|00000000|B00000000/);
  });
  it("refuses to publish if any identity value leaks into the fields or the statement", () => {
    const f = buildSasFields({ address: ADDRESS, subjectType: "natural_person", chain: ["Web3Rails Demo Root"], trustProfile: "demo", statement: "x", linked: false });
    expect(f.issuer).toBe("WEB3RAILS-DEMO");
    expect(() => assertNoPersonalData({ ...f, issuer: "FNMT B00000000" }, signer)).toThrow(/identity data/);
    expect(() => assertNoPersonalData({ ...f, statement_sha256: "00000000T" }, signer)).toThrow(/identity data/);
    expect(() => assertNoPersonalData({ ...f, extra: "1" } as never, signer)).toThrow(/unexpected fields/);
  });
  it("the statement hash is a hiding commitment: the same identity with another nonce gives an unrelated hash", () => {
    const base = { address: ADDRESS, subjectType: "legal_entity" as const, chain: ["AC RAIZ FNMT-RCM"], trustProfile: "qualified", linked: false };
    const a = buildSasFields({ ...base, statement: JSON.stringify({ entity: { tax_id: "B00000000" }, nonce: "0a".repeat(12) }) });
    const b = buildSasFields({ ...base, statement: JSON.stringify({ entity: { tax_id: "B00000000" }, nonce: "0b".repeat(12) }) });
    expect(a.statement_sha256).not.toBe(b.statement_sha256);
    expect(() => assertNoPersonalData(a, signer)).not.toThrow();
  });
  it("issuer comes from the chain root, never from the signer; expiry comes from the certificate", () => {
    expect(issuerFromChain(["a", "b", "AC RAIZ FNMT-RCM"], "qualified")).toBe("FNMT");
    expect(issuerFromChain(["Some Other Root CA"], "qualified")).toBe("Some Other Root CA");
    expect(issuerFromChain(null, "qualified")).toBe("UNKNOWN");
    expect(expiryFromSigner("2030-01-01T00:00:00Z")).toBe(Math.floor(Date.parse("2030-01-01T00:00:00Z") / 1000));
    expect(() => expiryFromSigner("2000-01-01T00:00:00Z")).toThrow(/expiry/);
    expect(() => expiryFromSigner(null)).toThrow(/expiry/);
  });
});

describe("sas attestations (database rules)", () => {
  let certId = "";
  beforeAll(async () => {
    extractDemoKeys();
    adm = await makeUser("sasadm");
    op = await makeUser("sasop");
    org = (await adm.client.rpc("create_organization", { p_name: "SAS " + run, p_slug: "sas-" + run })).data as string;
    await admin.from("organizations").update({ is_demo: true }).eq("id", org);
    await admin.from("memberships").insert([{ org_id: org, user_id: op.id, role: "operator" }]);
    const { data: ent } = await admin.from("legal_entities").select("id").eq("org_id", org).single();
    await admin.from("legal_entities").update({ tax_id: "B00000000" }).eq("id", ent!.id);
    const { data: w } = await admin.from("wallets").insert({ org_id: org, entity_id: ent!.id, chain: "solana", address: ADDRESS, label: "sas" }).select("id").single();
    wallet = w!.id;
    // a verified certificate attestation, produced the way the server does it (demo profile)
    const { data: issued } = await adm.client.rpc("issue_wallet_attestation", { p_wallet: wallet, p_method: "certificate" });
    certId = issued.id;
    const sig = signText(issued.statement);
    const report = await verifyCades({ signatureDer: sig, content: Buffer.from(issued.statement, "utf8"), profile: "demo" });
    expect(report.verdict).toBe("accepted");
    const signerJson = JSON.stringify(report.signer);
    const rec = await adm.client.rpc("record_wallet_attestation", { p_id: certId, p_verdict: "verified", p_proof: attestationProof(certId, "verified", signerJson), p_signer_json: signerJson, p_chain: report.chain, p_ocsp: report.ocsp, p_reasons: [], p_signature_b64: sig.toString("base64"), p_certificate_pem: report.certificatePem });
    expect(rec.error).toBeNull();
  });
  afterAll(async () => {
    for (const id of users) await admin.auth.admin.deleteUser(id);
  });

  const goodFields = () => ({ wallet: ADDRESS, subject_type: "legal_entity", level: "qualified", issuer: "WEB3RAILS-DEMO", statement_sha256: "a".repeat(64) });

  it("nothing is published without the wallet's opt-in, and only admins switch it", async () => {
    const before = await adm.client.rpc("record_sas_attestation", { p_attestation: certId, ...fakeChain, p_fields: goodFields(), p_expiry: "2030-01-01T00:00:00Z" });
    expect(before.error?.message).toMatch(/FORBIDDEN: this wallet has not opted in/);
    const opNo = await op.client.rpc("set_wallet_sas_opt_in", { p_wallet: wallet, p_opt_in: true });
    expect(opNo.error?.message).toMatch(/FORBIDDEN/);
    const ok = await adm.client.rpc("set_wallet_sas_opt_in", { p_wallet: wallet, p_opt_in: true });
    expect(ok.error).toBeNull();
    const { data: w } = await admin.from("wallets").select("sas_opt_in").eq("id", wallet).single();
    expect(w!.sas_opt_in).toBe(true);
    const { data: ev } = await admin.from("audit_events").select("action, before, after").eq("entity_id", wallet).eq("action", "sas_opt_in_changed");
    expect(ev).toHaveLength(1);
    expect(ev![0].after).toEqual({ sas_opt_in: true });
  });

  it("the database refuses anything but the five fields, a foreign wallet, or a bad level; operators cannot publish", async () => {
    const four = await adm.client.rpc("record_sas_attestation", { p_attestation: certId, ...fakeChain, p_fields: { wallet: ADDRESS, subject_type: "legal_entity", level: "qualified", issuer: "FNMT" }, p_expiry: "2030-01-01T00:00:00Z" });
    expect(four.error?.message).toMatch(/INVALID: an attestation carries exactly/);
    const six = await adm.client.rpc("record_sas_attestation", { p_attestation: certId, ...fakeChain, p_fields: { ...goodFields(), name: "MARIA" }, p_expiry: "2030-01-01T00:00:00Z" });
    expect(six.error?.message).toMatch(/INVALID: an attestation carries exactly/);
    const other = await adm.client.rpc("record_sas_attestation", { p_attestation: certId, ...fakeChain, p_fields: { ...goodFields(), wallet: "TESTWALLET1111111111111111111111111111111111" }, p_expiry: "2030-01-01T00:00:00Z" });
    expect(other.error?.message).toMatch(/INVALID: the attested wallet is not this wallet/);
    const level = await adm.client.rpc("record_sas_attestation", { p_attestation: certId, ...fakeChain, p_fields: { ...goodFields(), level: "verified_by_name" }, p_expiry: "2030-01-01T00:00:00Z" });
    expect(level.error?.message).toMatch(/INVALID: level/);
    const opPub = await op.client.rpc("record_sas_attestation", { p_attestation: certId, ...fakeChain, p_fields: goodFields(), p_expiry: "2030-01-01T00:00:00Z" });
    expect(opPub.error?.message).toMatch(/FORBIDDEN: publishing an attestation requires admin/);
  });

  it("a valid publish is recorded once; opting out needs a close first; the close is recorded with its signature", async () => {
    const { data: id, error } = await adm.client.rpc("record_sas_attestation", { p_attestation: certId, ...fakeChain, p_fields: goodFields(), p_expiry: "2030-01-01T00:00:00Z" });
    expect(error).toBeNull();
    const again = await adm.client.rpc("record_sas_attestation", { p_attestation: certId, ...fakeChain, p_fields: goodFields(), p_expiry: "2030-01-01T00:00:00Z" });
    expect(again.error?.message).toMatch(/CONFLICT: this wallet already has a published attestation/);
    const out = await adm.client.rpc("set_wallet_sas_opt_in", { p_wallet: wallet, p_opt_in: false });
    expect(out.error?.message).toMatch(/CONFLICT: close the published attestation/);
    const { data: row } = await adm.client.from("sas_attestations").select("status, fields, attestation_pda, cluster").eq("id", id as string).single();
    expect(row).toMatchObject({ status: "published", attestation_pda: fakeChain.p_pda, cluster: "devnet" });
    expect(Object.keys(row!.fields as object).sort()).toEqual([...SAS_FIELD_NAMES].sort());
    const opClose = await op.client.rpc("record_sas_close", { p_id: id as string, p_signature: "c1" });
    expect(opClose.error?.message).toMatch(/FORBIDDEN/);
    const closed = await adm.client.rpc("record_sas_close", { p_id: id as string, p_signature: "c1osE" + run });
    expect(closed.error).toBeNull();
    const twice = await adm.client.rpc("record_sas_close", { p_id: id as string, p_signature: "c2" });
    expect(twice.error?.message).toMatch(/CONFLICT: attestation is not published/);
    const { data: after } = await admin.from("sas_attestations").select("status, close_signature, closed_by").eq("id", id as string).single();
    expect(after).toMatchObject({ status: "closed", close_signature: "c1osE" + run, closed_by: adm.id });
    const out2 = await adm.client.rpc("set_wallet_sas_opt_in", { p_wallet: wallet, p_opt_in: false });
    expect(out2.error).toBeNull();
    const { data: ev } = await admin.from("audit_events").select("action").eq("entity_id", wallet).in("action", ["sas_published", "sas_closed"]).order("at");
    expect(ev!.map((e) => e.action)).toEqual(["sas_published", "sas_closed"]);
  });
});
