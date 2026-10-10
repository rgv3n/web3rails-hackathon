/**
 * Integration catalogue shown in the account area.
 * Maturity is product truth: nothing here claims a working connector that does not exist.
 *   available   → works in this version
 *   building    → being built now (front office v1 roadmap)
 *   planned     → on the roadmap, no date
 */
export type Maturity = "available" | "building" | "planned";

export const maturityLabel: Record<Maturity, string> = {
  available: "Available",
  building: "In development",
  planned: "Planned",
};

export interface Integration {
  slug: string;
  name: string;
  text: string;
  maturity: Maturity;
}

export interface IntegrationGroup {
  title: string;
  caption: string;
  items: Integration[];
}

export const integrationGroups: IntegrationGroup[] = [
  {
    title: "Direct integration",
    caption: "Connect Web3Rails to your own systems",
    items: [
      { slug: "rest-api", name: "REST API", text: "Read normalized transactions, reconciliations, wallets and exceptions. Confirm or override matches.", maturity: "building" },
      { slug: "webhooks", name: "Webhooks", text: "transaction.detected · reconciliation.completed · reconciliation.requires_review", maturity: "planned" },
      { slug: "sdk-typescript", name: "TypeScript SDK", text: "Typed client generated from the API schema.", maturity: "planned" },
    ],
  },
  {
    title: "Onchain sources",
    caption: "Where value settles",
    items: [
      { slug: "solana-wallets", name: "Solana wallets", text: "Connect with Phantom or declare any address; read-only sync of stablecoin transfers (USDC, USDT, EURC) through Helius; prove control by signing with the wallet key.", maturity: "building" },
      { slug: "ethereum", name: "Ethereum", text: "ERC-20 stablecoin transfers.", maturity: "planned" },
      { slug: "base", name: "Base", text: "ERC-20 stablecoin transfers.", maturity: "planned" },
    ],
  },
  {
    title: "Identity and qualified signatures",
    caption: "Who controls a wallet, proven with a legal identity. One attestation model; the evidence profile depends on the jurisdiction.",
    items: [
      { slug: "fnmt", name: "FNMT (Spain)", text: "The legal representative signs the ownership statement with an FNMT certificate through AutoFirma. Web3Rails verifies signature, chain, revocation (OCSP) and identity (NIF, CIF). Beta, desktop only.", maturity: "available" },
      { slug: "eu-trusted-list", name: "EU Trusted List (any eIDAS qualified provider)", text: "Accept certificates from every qualified trust service provider in the EU list, not only FNMT: D-Trust, Certum, Certeurope, FINA, eParaksts and the rest. Same flow, broader trust store.", maturity: "planned" },
      { slug: "cloud-qes", name: "Cloud qualified signatures (CSC API)", text: "Sign from the browser or phone without a local certificate: itsme, Smart-ID, Chave Móvel Digital, D-Trust sign-me, Certum SimplySign and other providers on the Cloud Signature Consortium API.", maturity: "planned" },
      { slug: "eudi-wallet", name: "EU Digital Identity Wallet (eIDAS 2.0)", text: "Qualified signature and verified company attributes from the European wallet once member states issue it.", maturity: "planned" },
      { slug: "swiss-zertes", name: "Switzerland (ZertES)", text: "Swiss qualified signatures, interoperable with the EU flow.", maturity: "planned" },
      { slug: "uk-eidas", name: "United Kingdom (UK eIDAS)", text: "Qualified signatures under the UK regime after Brexit.", maturity: "planned" },
      { slug: "us-verified-signer", name: "United States: identity-verified signer", text: "No qualified certificates in the US. Ownership is tied to a signer verified by an identity provider (document and biometrics) with an ESIGN-compliant audit trail.", maturity: "planned" },
      { slug: "us-kyb", name: "United States: company verification (KYB)", text: "Company identity from the EIN, state registries and registry providers, attached to the ownership evidence.", maturity: "planned" },
    ],
  },
  {
    title: "Invoices and financial records",
    caption: "What transactions are matched against",
    items: [
      { slug: "csv-invoices", name: "CSV import", text: "Upload open invoices with column mapping.", maturity: "building" },
      { slug: "holded", name: "Holded", text: "Sync customers, invoices and post reconciled payments.", maturity: "planned" },
      { slug: "quickbooks", name: "QuickBooks Online", text: "Sync customers, invoices and post reconciled payments.", maturity: "planned" },
      { slug: "xero", name: "Xero", text: "Sync contacts, invoices and payments.", maturity: "planned" },
      { slug: "sage", name: "Sage", text: "Sync invoices and payments.", maturity: "planned" },
      { slug: "a3", name: "Wolters Kluwer a3", text: "Export in the a3 accounting format.", maturity: "planned" },
    ],
  },
  {
    title: "ERP and treasury",
    caption: "Where records are used",
    items: [
      { slug: "netsuite", name: "Oracle NetSuite", text: "Journal entries and bank reconciliation.", maturity: "planned" },
      { slug: "dynamics", name: "Microsoft Dynamics 365", text: "Journal entries and bank reconciliation.", maturity: "planned" },
      { slug: "sap", name: "SAP", text: "Journal entries via standard interfaces.", maturity: "planned" },
    ],
  },
  {
    title: "Exports and data",
    caption: "Take your records anywhere",
    items: [
      { slug: "csv-export", name: "CSV export", text: "Reconciled records by period with evidence references.", maturity: "building" },
      { slug: "warehouse", name: "Data warehouse", text: "Scheduled delivery to BigQuery or Snowflake.", maturity: "planned" },
    ],
  },
];

export const allIntegrations = integrationGroups.flatMap((g) => g.items);
export function findIntegration(slug: string) {
  return allIntegrations.find((i) => i.slug === slug);
}
