/**
 * Demo data for the marketing site.
 * Everything here is illustrative. Nothing represents real customers,
 * volumes or transactions. Keep it labelled as such wherever it is rendered.
 */

export const pipelineStages = [
  { name: "Detect", text: "Ingest wallet and blockchain activity as it settles." },
  { name: "Normalize", text: "Create one consistent transaction record per movement." },
  { name: "Enrich", text: "Add asset, wallet, counterparty and fiat context." },
  { name: "Match", text: "Connect transactions to invoices and internal records." },
  { name: "Classify", text: "Assign financial meaning and accounting treatment." },
  { name: "Review", text: "Escalate ambiguous transactions instead of guessing." },
  { name: "Export", text: "Deliver structured records to finance systems." },
] as const;

export const cfoQuestions = [
  "Who paid us?",
  "Which invoice does this transaction belong to?",
  "Which entity owns this wallet?",
  "Was this an internal transfer?",
  "What was the fiat value at settlement?",
  "How should the transaction be classified?",
  "Has it already been reconciled?",
  "Can an auditor reproduce the decision?",
] as const;

export const capabilities = [
  {
    name: "Reconciliation",
    text: "Match onchain payments against invoices, counterparties and internal financial records.",
    icon: "link",
  },
  {
    name: "Financial data normalization",
    text: "Transform fragmented blockchain activity into consistent, enterprise-grade records.",
    icon: "layers",
  },
  {
    name: "Counterparty resolution",
    text: "Connect addresses and wallets with financial entities and business context.",
    icon: "building",
  },
  {
    name: "Exception management",
    text: "Process high-confidence matches automatically. Route ambiguous activity for review.",
    icon: "alert",
  },
  {
    name: "Auditability",
    text: "Keep traceability from every financial record back to its source transaction and evidence.",
    icon: "search",
  },
  {
    name: "Enterprise integration",
    text: "Expose structured financial information through APIs, exports and accounting integrations.",
    icon: "plug",
  },
  {
    name: "Treasury visibility",
    text: "Distinguish operational payments from internal wallet movements and treasury activity.",
    icon: "wallet",
  },
] as const;

export type Maturity = "mvp" | "prototype" | "planned";

export const maturityLabel: Record<Maturity, string> = {
  mvp: "MVP",
  prototype: "Prototype",
  planned: "Planned",
};

export interface ArchNode {
  name: string;
  maturity: Maturity;
}

export const architecture: { title: string; caption: string; nodes: ArchNode[] }[] = [
  {
    title: "Onchain",
    caption: "Where value settles",
    nodes: [
      { name: "Solana", maturity: "mvp" },
      { name: "Stablecoins", maturity: "mvp" },
      { name: "Wallets", maturity: "mvp" },
      { name: "Ethereum", maturity: "planned" },
      { name: "Base", maturity: "planned" },
      { name: "Protocols", maturity: "planned" },
      { name: "Payment rails", maturity: "planned" },
    ],
  },
  {
    title: "Web3Rails data layer",
    caption: "Where movement becomes a record",
    nodes: [
      { name: "Ingestion", maturity: "mvp" },
      { name: "Normalization", maturity: "mvp" },
      { name: "Identity", maturity: "prototype" },
      { name: "Matching", maturity: "mvp" },
      { name: "Reconciliation", maturity: "mvp" },
      { name: "Controls", maturity: "prototype" },
      { name: "Audit trail", maturity: "prototype" },
    ],
  },
  {
    title: "Enterprise finance",
    caption: "Where records are used",
    nodes: [
      { name: "Accounting", maturity: "prototype" },
      { name: "Reporting", maturity: "prototype" },
      { name: "Internal systems (API)", maturity: "prototype" },
      { name: "ERP", maturity: "planned" },
      { name: "Treasury", maturity: "planned" },
      { name: "Compliance", maturity: "planned" },
    ],
  },
];

export const useCases = [
  {
    name: "Stablecoin payments",
    text: "Reconcile incoming and outgoing stablecoin payments against customers, invoices and internal records.",
  },
  {
    name: "Onchain treasury",
    text: "Separate treasury movements, operational transfers and economic transactions.",
  },
  {
    name: "Crypto-native companies",
    text: "Convert high-volume blockchain activity into structured financial records.",
  },
  {
    name: "Payment infrastructure",
    text: "Provide reconciliation and reporting context around blockchain-based settlement.",
  },
  {
    name: "Accounting and audit",
    text: "Preserve the evidence linking financial records with source transactions.",
  },
  {
    name: "Tokenized finance",
    text: "Prepare financial operations for increasingly programmable financial assets.",
  },
] as const;

export const visionLayers = [
  { name: "Reconciliation", state: "Current wedge" },
  { name: "Financial data", state: "In progress" },
  { name: "Accounting infrastructure", state: "Direction" },
  { name: "Treasury", state: "Direction" },
  { name: "Controls", state: "Direction" },
  { name: "Financial intelligence", state: "Direction" },
] as const;

export const controls = [
  {
    name: "Traceability",
    text: "Every reconciled record retains a link to its source transaction and the evidence used to match it.",
  },
  {
    name: "Exception-first workflows",
    text: "Low-confidence transactions are escalated for review. They are never accepted silently.",
  },
  {
    name: "Human oversight",
    text: "Critical classifications stay reviewable and reversible. A decision can be reopened.",
  },
  {
    name: "Data provenance",
    text: "Each field records where it came from: chain data, an invoice, a rule or a person.",
  },
  {
    name: "Read-only by design",
    text: "Web3Rails reads public onchain activity and your financial records. It does not hold keys or move funds.",
  },
] as const;

export const apiEndpoints = [
  { method: "GET", path: "/transactions", text: "Normalized onchain movements" },
  { method: "GET", path: "/reconciliations", text: "Records with status and evidence" },
  { method: "POST", path: "/matches", text: "Confirm or override a match" },
  { method: "GET", path: "/wallets", text: "Known wallets and their owners" },
  { method: "GET", path: "/exceptions", text: "Items waiting for review" },
] as const;

export const webhookEvents = [
  "transaction.detected",
  "reconciliation.completed",
  "reconciliation.requires_review",
] as const;

export const apiSample = `{
  "id": "rec_01J8Z3K9Q4",
  "status": "reconciled",
  "confidence": 0.98,
  "transaction": {
    "hash": "4xQe8bZ1…9fKd",
    "network": "solana",
    "block_time": "2026-09-21T14:32:17Z"
  },
  "asset": { "symbol": "USDC", "amount": "4250.00" },
  "fiat": {
    "currency": "EUR",
    "value": "3633.28",
    "rate_source": "ecb_reference",
    "rate_time": "2026-09-21T14:15:00Z"
  },
  "counterparty": {
    "id": "cp_7f21",
    "name": "Acme Ltd.",
    "resolved_by": "invoice_reference"
  },
  "invoice": { "id": "INV-291", "system": "accounting" },
  "classification": "customer_payment",
  "accounting_treatment": "accounts_receivable_settlement",
  "evidence": [
    "transaction",
    "invoice_amount_match",
    "counterparty_wallet_history"
  ],
  "decided_by": "rule:ar_match_v3",
  "reviewable": true
}`;

export const webhookSample = `{
  "event": "reconciliation.requires_review",
  "created_at": "2026-09-21T13:05:41Z",
  "data": {
    "reconciliation_id": "rec_01J8Z2M7XA",
    "transaction_hash": "8hTk3vL9…2mPa",
    "amount": "1840.00",
    "asset": "USDC",
    "confidence": 0.64,
    "reason": "counterparty_unresolved"
  }
}`;
