/**
 * What a public attestation may say, and nothing else. Pure functions: no chain, no database.
 * Decision of 11-oct-2026: five fields, nothing derived from the NIF, the CIF or the names on the certificate.
 */
import { createHash } from "node:crypto";

export const SAS_FIELD_NAMES = ["wallet", "subject_type", "level", "issuer", "statement_sha256"] as const;
export type SasLevel = "qualified" | "qualified_linked";
export interface SasFields {
  wallet: string;
  subject_type: "legal_entity" | "natural_person";
  level: SasLevel;
  issuer: string;
  statement_sha256: string;
}
export interface SignerIdentity {
  nif?: string | null;
  cif?: string | null;
  commonName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  organization?: string | null;
  serial?: string | null;
  notAfter?: string | null;
}

/** The trust-service provider behind the certificate, from the chain's root CN. Never the signer. */
export function issuerFromChain(chain: string[] | null | undefined, trustProfile: string): string {
  if (trustProfile === "demo") return "WEB3RAILS-DEMO";
  const root = (chain ?? [])[Math.max((chain ?? []).length - 1, 0)] ?? "";
  if (/FNMT/i.test(root)) return "FNMT";
  return root.replace(/[^A-Za-z0-9 .-]/g, "").slice(0, 32) || "UNKNOWN";
}

export function buildSasFields(input: {
  address: string;
  subjectType: "legal_entity" | "natural_person";
  chain: string[] | null | undefined;
  trustProfile: string;
  statement: string;
  linked: boolean;
}): SasFields {
  return {
    wallet: input.address,
    subject_type: input.subjectType,
    level: input.linked ? "qualified_linked" : "qualified",
    issuer: issuerFromChain(input.chain, input.trustProfile),
    statement_sha256: createHash("sha256").update(input.statement, "utf8").digest("hex"),
  };
}

/** Certificate expiry → attestation expiry (unix seconds). 0 would mean "never"; we never publish without an expiry. */
export function expiryFromSigner(notAfter: string | null | undefined): number {
  const t = notAfter ? Date.parse(notAfter) : NaN;
  if (!Number.isFinite(t) || t <= Date.now()) throw new Error("the certificate has no future expiry; nothing to publish");
  return Math.floor(t / 1000);
}

const normalize = (v: string) => v.toUpperCase().replace(/^(VAT|IDC|NTR|LEI|PAS|PNO)[A-Z]{2}-/, "").replace(/[\s-]/g, "");

/**
 * Defence in depth: refuses to publish if any identity value from the certificate appears in the fields.
 * The signed statement itself names the entity (it is the off-chain evidence and stays off-chain); only its SHA-256 is published,
 * and the statement carries a 96-bit random nonce, so that hash hides its content: it cannot be reversed nor used to test a guessed tax id.
 */
export function assertNoPersonalData(fields: SasFields, signer: SignerIdentity): void {
  const haystack = normalize(Object.values(fields).join("|"));
  const values = [signer.nif, signer.cif, signer.commonName, signer.givenName, signer.surname, signer.organization, signer.serial]
    .filter((v): v is string => typeof v === "string" && v.trim().length >= 4)
    .map(normalize);
  for (const v of values) {
    if (v && haystack.includes(v)) throw new Error("refusing to publish: the attestation or the statement would carry identity data from the certificate");
  }
  const keys = Object.keys(fields).sort();
  if (keys.join(",") !== [...SAS_FIELD_NAMES].sort().join(",")) throw new Error("refusing to publish: unexpected fields");
}
