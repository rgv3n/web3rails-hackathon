/**
 * Verifies a CAdES/CMS signature (as produced by AutoFirma with an FNMT or other eIDAS certificate) in pure Node:
 *   1. the cryptographic signature over the exact statement bytes the server issued
 *   2. the certificate chain up to a trust anchor of the organization's trust profile
 *   3. revocation through OCSP (mandatory for qualified anchors; skipped and labelled for the demo anchor)
 *   4. the signer's identity from the certificate subject (NIF, CIF, names)
 * Nothing here estimates: every rejection carries its reason, every acceptance its evidence.
 */
import * as pkijs from "pkijs";
import { DEMO_ROOT_PEM, FNMT_INTERMEDIATES_PEM, FNMT_ROOT_PEM } from "./trust";

pkijs.setEngine("node", new pkijs.CryptoEngine({ name: "node", crypto: globalThis.crypto }));

export type TrustProfile = "qualified" | "demo";
export interface Signer {
  kind: "company_representative" | "natural_person";
  nif: string | null; // serialNumber, e.g. IDCES-12345678Z
  cif: string | null; // organizationIdentifier, e.g. VATES-B12345674
  organization: string | null;
  commonName: string | null;
  givenName: string | null;
  surname: string | null;
  notBefore: string;
  notAfter: string;
  serial: string;
}
export interface VerifyReport {
  verdict: "accepted" | "rejected";
  reasons: string[];
  signature: boolean;
  chain: string[] | null; // subject CNs from signer to anchor
  anchor: "fnmt" | "demo" | null;
  ocsp: { url: string; status?: "good" | "revoked" | "unknown"; producedAt?: string; error?: string; skipped?: string } | null;
  /** The signed OCSP response as received (DER, base64): evidence that outlives the responder's answer. */
  ocspResponseB64: string | null;
  signer: Signer | null;
  signingTime: string | null;
  certificatePem: string | null;
}

type SubjectKey = "serialNumber" | "organizationIdentifier" | "O" | "CN" | "GN" | "SN";
const OID: Record<string, SubjectKey> = { "2.5.4.5": "serialNumber", "2.5.4.97": "organizationIdentifier", "2.5.4.10": "O", "2.5.4.3": "CN", "2.5.4.42": "GN", "2.5.4.4": "SN" };
/** pkijs wants a plain ArrayBuffer; Node Buffers are views over a shared pool. */
function ab(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
const OCSP_STATUS: Array<"good" | "revoked" | "unknown"> = ["good", "revoked", "unknown"];

function pemToCert(pem: string): pkijs.Certificate {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return pkijs.Certificate.fromBER(ab(Buffer.from(b64, "base64")));
}
function certToPem(cert: pkijs.Certificate): string {
  const b64 = Buffer.from(cert.toSchema(true).toBER(false)).toString("base64");
  return `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----`;
}
function subjectMap(cert: pkijs.Certificate): Partial<Record<SubjectKey, string>> {
  const out: Partial<Record<SubjectKey, string>> = {};
  for (const tv of cert.subject.typesAndValues) {
    const key = OID[tv.type];
    if (key) out[key] = String((tv.value as unknown as { valueBlock: { value: string } }).valueBlock.value);
  }
  return out;
}
function cn(cert: pkijs.Certificate): string {
  return subjectMap(cert).CN ?? cert.subject.typesAndValues.map((t) => String((t.value as unknown as { valueBlock: { value: string } }).valueBlock.value)).join(", ");
}
function sameCert(a: pkijs.Certificate, b: pkijs.Certificate) {
  return a.subject.isEqual(b.subject) && a.serialNumber.isEqual(b.serialNumber);
}
function aiaOcspUrl(cert: pkijs.Certificate): string | null {
  const ext = cert.extensions?.find((e) => e.extnID === "1.3.6.1.5.5.7.1.1");
  const aia = ext?.parsedValue as { accessDescriptions?: Array<{ accessMethod: string; accessLocation: { value: string } }> } | undefined;
  return aia?.accessDescriptions?.find((d) => d.accessMethod === "1.3.6.1.5.5.7.48.1")?.accessLocation?.value ?? null;
}

async function checkOcsp(leaf: pkijs.Certificate, issuer: pkijs.Certificate, url: string, roots: pkijs.Certificate[]) {
  const req = new pkijs.OCSPRequest();
  await req.createForCertificate(leaf, { hashAlgorithm: "SHA-1", issuerCertificate: issuer });
  const body = Buffer.from(req.toSchema(true).toBER(false));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/ocsp-request" }, body, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`OCSP HTTP ${res.status}`);
  const rawResponse = new Uint8Array(await res.arrayBuffer());
  const resp = pkijs.OCSPResponse.fromBER(ab(rawResponse));
  if (resp.responseStatus.valueBlock.valueDec !== 0) throw new Error(`OCSP responseStatus ${resp.responseStatus.valueBlock.valueDec}`);
  if (!resp.responseBytes) throw new Error("OCSP response without responseBytes");
  const basic = pkijs.BasicOCSPResponse.fromBER(ab(resp.responseBytes.response.valueBlock.valueHexView));
  // RFC 6960 §4.2.2.2: the responder is the issuer or a certificate the issuer delegated. The issuer goes into the
  // response's certificate pool (not into the anchors) so pkijs can build the responder's chain to a root.
  const pool = basic.certs ?? [];
  if (!pool.some((c) => sameCert(c, issuer))) pool.push(issuer);
  basic.certs = pool;
  const rid = basic.tbsResponseData.responderID;
  const responder = (rid instanceof pkijs.RelativeDistinguishedNames ? pool.find((c) => c.subject.isEqual(rid)) : undefined) ?? issuer;
  if (!sameCert(responder, issuer) && !responder.issuer.isEqual(issuer.subject)) throw new Error("OCSP responder is neither the issuer nor delegated by it");
  const responderOk = await basic.verify({ trustedCerts: roots });
  if (!responderOk) throw new Error("OCSP response not signed by a trusted responder");
  const st = await basic.getCertificateStatus(leaf, issuer);
  if (!st.isForCertificate) throw new Error("OCSP response is for another certificate");
  return { status: OCSP_STATUS[st.status] ?? "unknown", producedAt: basic.tbsResponseData.producedAt.toISOString(), raw: Buffer.from(rawResponse).toString("base64") };
}

export async function verifyCades(input: { signatureDer: Uint8Array; content: Uint8Array; profile: TrustProfile; now?: Date }): Promise<VerifyReport> {
  const now = input.now ?? new Date();
  const report: VerifyReport = { verdict: "rejected", reasons: [], signature: false, chain: null, anchor: null, ocsp: null, ocspResponseB64: null, signer: null, signingTime: null, certificatePem: null };
  const fnmtRoot = pemToCert(FNMT_ROOT_PEM);
  const demoRoot = pemToCert(DEMO_ROOT_PEM);
  const roots = input.profile === "demo" ? [fnmtRoot, demoRoot] : [fnmtRoot];

  let signed: pkijs.SignedData;
  try {
    const cms = pkijs.ContentInfo.fromBER(ab(input.signatureDer));
    if (cms.contentType !== pkijs.ContentInfo.SIGNED_DATA) throw new Error("not CMS SignedData");
    signed = new pkijs.SignedData({ schema: cms.content });
  } catch (e) {
    report.reasons.push(`signature is not a readable CAdES/CMS structure: ${(e as Error).message}`);
    return report;
  }
  const si = signed.signerInfos[0];
  const certs = (signed.certificates ?? []).filter((c): c is pkijs.Certificate => c instanceof pkijs.Certificate);
  const sid = si?.sid as { serialNumber?: pkijs.Certificate["serialNumber"] } | undefined;
  const leaf = certs.find((c) => sid?.serialNumber && c.serialNumber.isEqual(sid.serialNumber));
  if (!si || !leaf) {
    report.reasons.push("signer certificate is not embedded in the signature");
    return report;
  }
  // Offer the known intermediates to the chain builder (AutoFirma embeds them; other tools may not).
  for (const pem of FNMT_INTERMEDIATES_PEM) {
    const c = pemToCert(pem);
    if (!certs.some((x) => sameCert(x, c))) signed.certificates = [...(signed.certificates ?? []), c];
  }
  const sm = subjectMap(leaf);
  report.signer = {
    kind: sm.organizationIdentifier ? "company_representative" : "natural_person",
    nif: sm.serialNumber ?? null,
    cif: sm.organizationIdentifier ?? null,
    organization: sm.O ?? null,
    commonName: sm.CN ?? null,
    givenName: sm.GN ?? null,
    surname: sm.SN ?? null,
    notBefore: leaf.notBefore.value.toISOString(),
    notAfter: leaf.notAfter.value.toISOString(),
    serial: Buffer.from(leaf.serialNumber.valueBlock.valueHexView).toString("hex"),
  };
  report.certificatePem = certToPem(leaf);
  const st = si.signedAttrs?.attributes.find((a) => a.type === "1.2.840.113549.1.9.5");
  if (st) report.signingTime = (st.values[0] as { toDate: () => Date }).toDate().toISOString();

  // 0: an attached (implicit) signature carries its own copy of the content. It must be byte-identical to what we
  // issued; otherwise a valid signature over different bytes could pass as a signature over ours.
  const eContent = signed.encapContentInfo.eContent as unknown as { getValue: () => ArrayBuffer } | undefined;
  if (eContent) {
    const embedded = Buffer.from(eContent.getValue()); // same accessor pkijs uses when it verifies attached content
    if (!embedded.equals(Buffer.from(input.content))) report.reasons.push("embedded content differs from the issued statement");
  }

  // 1 + 2: signature over OUR bytes and chain to an anchor, in one pass
  const result = (await signed.verify({ signer: 0, data: ab(input.content), trustedCerts: roots, checkChain: true, extendedMode: true }).catch((e: unknown) => e)) as {
    signatureVerified?: boolean;
    certificatePath?: pkijs.Certificate[];
    message?: string;
  };
  report.signature = result.signatureVerified === true;
  if (!report.signature) {
    // When the chain fails, pkijs stops before checking the signature. Check it alone so the report says what is true.
    const plain = await signed.verify({ signer: 0, data: ab(input.content), checkChain: false }).catch(() => false);
    report.signature = plain === true;
  }
  const path = Array.isArray(result.certificatePath) ? result.certificatePath : [];
  const anchorCert = path.at(-1);
  const anchor = anchorCert && sameCert(anchorCert, fnmtRoot) ? "fnmt" : anchorCert && sameCert(anchorCert, demoRoot) ? "demo" : null;
  report.chain = path.length ? path.map(cn) : null;
  report.anchor = anchor;
  if (!report.signature) report.reasons.push("signature does not verify over the issued statement");
  if (!anchor) report.reasons.push(`certificate chain does not end in a trusted authority${result.message ? `: ${result.message}` : ""}`);
  if (leaf.notAfter.value < now) report.reasons.push("certificate expired");
  if (leaf.notBefore.value > now) report.reasons.push("certificate not yet valid");

  // 3: revocation
  if (report.signature && anchor === "demo") {
    report.ocsp = { url: "", skipped: "demo trust profile: no revocation service for the demo authority" };
  } else if (report.signature && anchor === "fnmt") {
    const issuer = path[1];
    const url = aiaOcspUrl(leaf);
    if (!issuer || !url) report.reasons.push("certificate has no OCSP service (AIA); revocation cannot be checked");
    else {
      try {
        const { raw, ...ocsp } = await checkOcsp(leaf, issuer, url, roots);
        report.ocsp = { url, ...ocsp };
        report.ocspResponseB64 = raw;
        if (report.ocsp.status !== "good") report.reasons.push(`certificate status ${report.ocsp.status}`);
      } catch (e) {
        report.ocsp = { url, error: (e as Error).message };
        report.reasons.push(`revocation check failed: ${(e as Error).message}`);
      }
    }
  }
  report.verdict = report.reasons.length === 0 ? "accepted" : "rejected";
  return report;
}
