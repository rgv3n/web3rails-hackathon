import type { Signer } from "./verify-cades";

/** Normalises a tax id from a certificate subject or a form: strips ETSI prefixes (VATES-, IDCES-, NTRES-…), spaces and dashes. */
export function normalizeTaxId(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.toUpperCase().replace(/^(VAT|IDC|NTR|LEI|PAS|PNO)[A-Z]{2}-/, "").replace(/[\s-]/g, "");
  return s || null;
}

export interface EntityIdentity { name: string; tax_id: string | null; subject_type: "legal_entity" | "natural_person" }

/**
 * Who may sign for this entity. Cryptography says the signature is valid; this says the signer is the right one.
 *   legal_entity   → a company-representative certificate whose organizationIdentifier (CIF) equals the entity's tax id
 *   natural_person → any qualified certificate whose serialNumber (NIF) equals the person's tax id
 */
export function checkSignerPolicy(signer: Signer, entity: EntityIdentity): string[] {
  const reasons: string[] = [];
  const entityTax = normalizeTaxId(entity.tax_id);
  if (!entityTax) {
    reasons.push(`entity "${entity.name}" has no tax id; set it in Organization before verifying ownership`);
    return reasons;
  }
  if (entity.subject_type === "legal_entity") {
    if (signer.kind !== "company_representative") reasons.push("the certificate is a personal certificate; a company representative certificate is required for a legal entity");
    const cif = normalizeTaxId(signer.cif);
    if (cif && cif !== entityTax) reasons.push(`the certificate represents tax id ${cif}, not ${entityTax}`);
  } else {
    const nif = normalizeTaxId(signer.nif);
    if (!nif) reasons.push("the certificate carries no personal identifier (NIF)");
    else if (nif !== entityTax) reasons.push(`the certificate belongs to ${nif}, not to ${entityTax}`);
  }
  return reasons;
}
