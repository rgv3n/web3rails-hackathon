/**
 * Spike: verify a CAdES/CMS signature (as produced by AutoFirma with an FNMT certificate) in pure Node:
 *  1. cryptographic signature over the content (signed attributes, SHA-256)
 *  2. certificate chain up to a configured set of trusted CAs (FNMT roots in production)
 *  3. revocation through OCSP (AIA URL from the certificate, or override)
 *  4. identity extraction: NIF of the representative, CIF of the company, names
 * Usage: node verify-cades.mjs <signature.der> <content.json> <trusted-ca-dir> [--ocsp URL] [--no-ocsp]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

pkijs.setEngine("node", new pkijs.CryptoEngine({ name: "node", crypto: globalThis.crypto }));

const OID = { serialNumber: "2.5.4.5", organizationIdentifier: "2.5.4.97", O: "2.5.4.10", CN: "2.5.4.3", GN: "2.5.4.42", SN: "2.5.4.4", C: "2.5.4.6", OU: "2.5.4.11" };
const OCSP_STATUS = ["good", "revoked", "unknown"];

function pemToCert(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return pkijs.Certificate.fromBER(Buffer.from(b64, "base64"));
}
function loadTrusted(dir) {
  return readdirSync(dir).filter((f) => /\.(pem|cer|crt)$/i.test(f)).flatMap((f) => {
    const raw = readFileSync(join(dir, f));
    const text = raw.toString("utf8");
    if (text.includes("-----BEGIN")) return text.split(/(?=-----BEGIN CERTIFICATE-----)/).filter((s) => s.includes("BEGIN")).map(pemToCert);
    return [pkijs.Certificate.fromBER(raw)]; // DER
  });
}
function subjectMap(cert) {
  const out = {};
  for (const tv of cert.subject.typesAndValues) {
    const name = Object.keys(OID).find((k) => OID[k] === tv.type) ?? tv.type;
    out[name] = tv.value.valueBlock.value;
  }
  return out;
}
function aiaOcspUrl(cert) {
  const ext = cert.extensions?.find((e) => e.extnID === "1.3.6.1.5.5.7.1.1");
  if (!ext) return null;
  const aia = ext.parsedValue; // InfoAccess
  const ocsp = aia.accessDescriptions.find((d) => d.accessMethod === "1.3.6.1.5.5.7.48.1");
  return ocsp?.accessLocation?.value ?? null;
}

async function checkOcsp(leaf, issuer, url, trustedRoots) {
  const req = new pkijs.OCSPRequest();
  await req.createForCertificate(leaf, { hashAlgorithm: "SHA-1", issuerCertificate: issuer });
  const body = Buffer.from(req.toSchema(true).toBER(false));
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/ocsp-request" }, body });
  if (!res.ok) throw new Error(`OCSP HTTP ${res.status}`);
  const resp = pkijs.OCSPResponse.fromBER(await res.arrayBuffer());
  if (resp.responseStatus.valueBlock.valueDec !== 0) throw new Error(`OCSP responseStatus ${resp.responseStatus.valueBlock.valueDec}`);
  const basic = pkijs.BasicOCSPResponse.fromBER(resp.responseBytes.response.valueBlock.valueHexView);
  // RFC 6960 §4.2.2.2: the responder is the issuer itself, or a certificate issued by it with id-kp-OCSPSigning.
  // pkijs validates the responder chain only when the anchors are real roots (the issuer must not be in trustedCerts),
  // so the issuer goes into the response's certificate pool instead.
  const certs = basic.certs ?? [];
  if (!certs.some((c) => c.subject.isEqual(issuer.subject) && c.serialNumber.isEqual(issuer.serialNumber))) basic.certs = [...certs, issuer];
  const responder = basic.certs.find((c) => basic.tbsResponseData.responderID instanceof pkijs.RelativeDistinguishedNames ? c.subject.isEqual(basic.tbsResponseData.responderID) : true) ?? issuer;
  const responderIsIssuer = responder.subject.isEqual(issuer.subject) && responder.serialNumber.isEqual(issuer.serialNumber);
  const responderIssuedByIssuer = responder.issuer.isEqual(issuer.subject);
  if (!responderIsIssuer && !responderIssuedByIssuer) throw new Error("OCSP responder is neither the issuer nor delegated by it");
  const responderOk = await basic.verify({ trustedCerts: trustedRoots }).catch((e) => { throw new Error(`responder: ${e.message ?? e}`); });
  if (!responderOk) throw new Error("OCSP response not signed by a trusted responder");
  const st = await basic.getCertificateStatus(leaf, issuer);
  if (!st.isForCertificate) throw new Error("OCSP response is for another certificate");
  const producedAt = basic.tbsResponseData.producedAt;
  return { status: OCSP_STATUS[st.status] ?? st.status, producedAt };
}

export async function verifyCades({ signatureDer, content, trusted, ocspUrl, skipOcsp = false }) {
  const report = { signature: null, chain: null, ocsp: null, signer: null, signingTime: null, verdict: "rejected", reasons: [] };
  const cms = pkijs.ContentInfo.fromBER(signatureDer);
  if (cms.contentType !== pkijs.ContentInfo.SIGNED_DATA) throw new Error("not CMS SignedData");
  const signed = new pkijs.SignedData({ schema: cms.content });
  const si = signed.signerInfos[0];
  const leaf = signed.certificates.find((c) => c instanceof pkijs.Certificate && c.serialNumber.isEqual(si.sid.serialNumber));
  if (!leaf) throw new Error("signer certificate not embedded in the signature");
  report.signer = subjectMap(leaf);
  report.signer.notAfter = leaf.notAfter.value.toISOString();
  const st = si.signedAttrs?.attributes.find((a) => a.type === "1.2.840.113549.1.9.5");
  if (st) report.signingTime = st.values[0].toDate().toISOString();

  // 1 + 2: signature and chain in one pass (pkijs builds the chain from embedded certs + trusted set)
  const result = await signed.verify({ signer: 0, data: content, trustedCerts: trusted, checkChain: true, extendedMode: true }).catch((e) => e);
  report.signature = result.signatureVerified === true;
  const chainOk = Array.isArray(result.certificatePath) && result.certificatePath.length > 0 && trusted.some((t) => result.certificatePath.at(-1).subject.isEqual(t.subject));
  report.chain = chainOk ? result.certificatePath.map((c) => subjectMap(c).CN) : false;
  if (!report.signature) report.reasons.push("signature does not verify over this content");
  if (!chainOk) report.reasons.push(`chain does not end in a trusted CA${result.message ? `: ${result.message}` : ""}`);

  // 3: revocation
  if (report.signature && chainOk && !skipOcsp) {
    const issuer = result.certificatePath[1];
    const url = ocspUrl ?? aiaOcspUrl(leaf);
    if (!url) report.reasons.push("no OCSP URL (AIA) in certificate");
    else {
      try {
        report.ocsp = { url, ...(await checkOcsp(leaf, issuer, url, trusted)) };
        if (report.ocsp.status !== "good") report.reasons.push(`certificate status ${report.ocsp.status}`);
      } catch (e) {
        report.ocsp = { url, error: e.message };
        report.reasons.push(`OCSP failed: ${e.message}`);
      }
    }
  }
  if (new Date(report.signer.notAfter) < new Date()) report.reasons.push("certificate expired");
  report.verdict = report.reasons.length === 0 ? "accepted" : "rejected";
  return report;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [sig, content, caDir, ...rest] = process.argv.slice(2);
  const ocspIdx = rest.indexOf("--ocsp");
  const r = await verifyCades({
    signatureDer: readFileSync(sig),
    content: readFileSync(content),
    trusted: loadTrusted(caDir),
    ocspUrl: ocspIdx >= 0 ? rest[ocspIdx + 1] : undefined,
    skipOcsp: rest.includes("--no-ocsp"),
  });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.verdict === "accepted" ? 0 : 1);
}
