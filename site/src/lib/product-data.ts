/**
 * Demo records for the product demonstration.
 * Illustrative only. No real companies, wallets, transactions or volumes.
 * EUR values use a flat demo rate of 0.854862 EUR/USDC and 152.20 EUR/SOL.
 */

export type ReconStatus = "reconciled" | "review" | "processing";
export type Direction = "in" | "out" | "internal";
export type EvidenceKind = "strong" | "supporting" | "missing";

export interface WalletRef {
  label: string;
  address: string;
}

export interface JournalLine {
  account: string;
  debit?: string;
  credit?: string;
}

export interface Escalation {
  reason: string;
  missing: string[];
  decision: string;
  options: string[];
}

export interface ReconRecord {
  id: string;
  hash: string;
  network: "Solana";
  slot: string;
  timestamp: string;
  direction: Direction;
  wallet: WalletRef;
  counterpartyWallet: WalletRef;
  asset: "USDC" | "USDT" | "SOL";
  amount: string;
  fiat: { value: string; rate: string; source: string; time: string };
  counterparty: string | null;
  entity: string;
  invoice: string | null;
  purpose: string;
  classification: string;
  confidence: number;
  status: ReconStatus;
  reviewer: string | null;
  decidedBy: string;
  decidedAt: string;
  evidence: { kind: EvidenceKind; text: string }[];
  escalation?: Escalation;
  accounting: {
    treatment: string;
    period: string;
    lines: JournalLine[];
    exportBatch: string | null;
  };
}

export const productMetrics = [
  { label: "Total transactions", value: "1,284", hint: "1–21 Sep 2026 · 3 wallets" },
  { label: "Automatically reconciled", value: "1,197", hint: "no human involved" },
  { label: "Requires review", value: "87", hint: "in exception queue" },
  { label: "Reconciliation rate", value: "93.2%", hint: "by count · 95.6% by value" },
  { label: "Unmatched value", value: "€184,320", hint: "4.4% of period volume" },
] as const;

export const records: ReconRecord[] = [
  {
    id: "rec_01J8Z3K9Q4",
    hash: "4xQe8bZ1pM7v…9fKd",
    network: "Solana",
    slot: "292,481,006",
    timestamp: "2026-09-21 14:32:17 UTC",
    direction: "in",
    wallet: { label: "ops-receivables", address: "F91bA8cQ…19A" },
    counterpartyWallet: { label: "acme-ops", address: "7jK9d2Rf…x32" },
    asset: "USDC",
    amount: "5,000.00",
    fiat: { value: "€4,274.31", rate: "0.854862", source: "ECB reference", time: "14:15 UTC" },
    counterparty: "Acme Ltd.",
    entity: "Demo Co. Ltd (UK)",
    invoice: "INV-2026-192",
    purpose: "Customer payment",
    classification: "Accounts receivable settlement",
    confidence: 98,
    status: "reconciled",
    reviewer: null,
    decidedBy: "rule · ar_match_v3",
    decidedAt: "2026-09-21 14:32:41 UTC",
    evidence: [
      { kind: "strong", text: "Amount equals INV-2026-192 open balance: 5,000.00 USDC, 0.00% variance." },
      { kind: "strong", text: "Sender wallet 7jK9…x32 is labelled acme-ops; 6 prior payments reconciled to Acme Ltd." },
      { kind: "supporting", text: "Payment received 3 days before invoice due date (2026-09-24)." },
      { kind: "supporting", text: "Fiat value €4,274.31 at ECB reference rate, 2026-09-21 14:15 UTC." },
    ],
    accounting: {
      treatment: "Accounts receivable settlement",
      period: "Sep 2026",
      lines: [
        { account: "1010 · Digital assets — USDC (ops-receivables)", debit: "€4,274.31" },
        { account: "1200 · Accounts receivable — Acme Ltd.", credit: "€4,274.31" },
      ],
      exportBatch: "EXP-0921-03",
    },
  },
  {
    id: "rec_01J8Z2M7XA",
    hash: "8hTk3vL9qW2n…2mPa",
    network: "Solana",
    slot: "292,468,114",
    timestamp: "2026-09-21 13:05:41 UTC",
    direction: "in",
    wallet: { label: "ops-receivables", address: "F91bA8cQ…19A" },
    counterpartyWallet: { label: "unlabelled", address: "Dq4mR7Yz…8Yz1" },
    asset: "USDC",
    amount: "1,840.00",
    fiat: { value: "€1,572.94", rate: "0.854862", source: "ECB reference", time: "13:00 UTC" },
    counterparty: null,
    entity: "Demo Co. Ltd (UK)",
    invoice: null,
    purpose: "Undetermined",
    classification: "Pending classification",
    confidence: 64,
    status: "review",
    reviewer: "Unassigned",
    decidedBy: "escalated · confidence below 0.90",
    decidedAt: "2026-09-21 13:06:02 UTC",
    evidence: [
      { kind: "supporting", text: "Closest open invoice: INV-2026-197 from Vela Systems, 1,900.00 USDC (−3.2% variance)." },
      { kind: "supporting", text: "Received into the customer receivables wallet, not the treasury wallet." },
      { kind: "missing", text: "No invoice open for 1,840.00 USDC within the ±1% tolerance." },
      { kind: "missing", text: "Sender wallet has no label and no prior history with this entity." },
    ],
    escalation: {
      reason: "Counterparty unresolved and no invoice within tolerance.",
      missing: ["Counterparty identity", "Invoice reference", "Economic purpose"],
      decision: "Identify who paid and what the payment settles, or record it as an unapplied receipt.",
      options: ["Assign counterparty", "Match to INV-2026-197 (partial)", "Record as unapplied receipt", "Request remittance advice"],
    },
    accounting: {
      treatment: "Suspense — unapplied receipt (pending review)",
      period: "Sep 2026",
      lines: [
        { account: "1010 · Digital assets — USDC (ops-receivables)", debit: "€1,572.94" },
        { account: "2390 · Unapplied receipts (suspense)", credit: "€1,572.94" },
      ],
      exportBatch: null,
    },
  },
  {
    id: "rec_01J8Z1T4HB",
    hash: "Bq2n7Rt4sK8d…7Lx1",
    network: "Solana",
    slot: "292,455,302",
    timestamp: "2026-09-21 11:47:09 UTC",
    direction: "internal",
    wallet: { label: "treasury-a", address: "9Wc1pR3m…kQ7" },
    counterpartyWallet: { label: "treasury-b", address: "3Hf2vN8s…pR3" },
    asset: "USDC",
    amount: "25,000.00",
    fiat: { value: "€21,371.55", rate: "0.854862", source: "ECB reference", time: "11:45 UTC" },
    counterparty: "Treasury Wallet B",
    entity: "Demo Co. Ltd (UK)",
    invoice: "Internal",
    purpose: "Internal transfer",
    classification: "Treasury transfer — intra-entity",
    confidence: 99,
    status: "reconciled",
    reviewer: null,
    decidedBy: "rule · internal_wallets",
    decidedAt: "2026-09-21 11:47:20 UTC",
    evidence: [
      { kind: "strong", text: "Both wallets are registered to Demo Co. Ltd (UK) in the wallet registry." },
      { kind: "strong", text: "Matches treasury order TR-0921-01 (25,000.00 USDC, approved by Treasury Lead)." },
      { kind: "supporting", text: "Excluded from revenue, expense and counterparty exposure reports." },
      { kind: "supporting", text: "Network fee 0.000005 SOL booked separately as operating expense." },
    ],
    accounting: {
      treatment: "Intra-entity transfer between digital asset accounts",
      period: "Sep 2026",
      lines: [
        { account: "1011 · Digital assets — USDC (treasury-b)", debit: "€21,371.55" },
        { account: "1012 · Digital assets — USDC (treasury-a)", credit: "€21,371.55" },
      ],
      exportBatch: "EXP-0921-02",
    },
  },
  {
    id: "rec_01J8Z0P2CD",
    hash: "Zr9cK2WnbT5x…4Wq8",
    network: "Solana",
    slot: "292,441,877",
    timestamp: "2026-09-21 10:12:55 UTC",
    direction: "in",
    wallet: { label: "ops-receivables", address: "F91bA8cQ…19A" },
    counterpartyWallet: { label: "northwind-pay", address: "3Hf2Lm9k…kQ7" },
    asset: "USDC",
    amount: "9,600.00",
    fiat: { value: "€8,206.68", rate: "0.854862", source: "ECB reference", time: "10:00 UTC" },
    counterparty: "Northwind GmbH",
    entity: "Demo Co. GmbH (DE)",
    invoice: "INV-2026-188",
    purpose: "Customer payment",
    classification: "Accounts receivable settlement",
    confidence: 96,
    status: "processing",
    reviewer: null,
    decidedBy: "rule · ar_match_v3",
    decidedAt: "2026-09-21 10:13:08 UTC",
    evidence: [
      { kind: "strong", text: "Amount equals INV-2026-188 open balance: 9,600.00 USDC." },
      { kind: "strong", text: "Sender wallet labelled northwind-pay from 4 prior reconciled payments." },
      { kind: "supporting", text: "Fiat value €8,206.68 at ECB reference rate, 2026-09-21 10:00 UTC." },
    ],
    accounting: {
      treatment: "Accounts receivable settlement",
      period: "Sep 2026",
      lines: [
        { account: "1010 · Digital assets — USDC (ops-receivables)", debit: "€8,206.68" },
        { account: "1200 · Accounts receivable — Northwind GmbH", credit: "€8,206.68" },
      ],
      exportBatch: "EXP-0921-03",
    },
  },
  {
    id: "rec_01J8YXN6RS",
    hash: "Vt5aQ1Hc2Yd8…6Jn3",
    network: "Solana",
    slot: "292,430,515",
    timestamp: "2026-09-21 09:02:33 UTC",
    direction: "in",
    wallet: { label: "ops-receivables", address: "F91bA8cQ…19A" },
    counterpartyWallet: { label: "vela-treasury", address: "Hs7kW2Ec…4Lb" },
    asset: "USDC",
    amount: "3,100.00",
    fiat: { value: "€2,650.07", rate: "0.854862", source: "ECB reference", time: "09:00 UTC" },
    counterparty: "Vela Systems",
    entity: "Demo Co. Ltd (UK)",
    invoice: "INV-2026-197 (partial)",
    purpose: "Customer payment — partial",
    classification: "Pending: partial settlement",
    confidence: 71,
    status: "review",
    reviewer: "M. Okafor",
    decidedBy: "escalated · amount below invoice",
    decidedAt: "2026-09-21 09:03:10 UTC",
    evidence: [
      { kind: "strong", text: "Sender wallet vela-treasury is labelled and linked to Vela Systems." },
      { kind: "supporting", text: "Amount is exactly 50% of INV-2026-197 (6,200.00 USDC); invoice terms allow two instalments." },
      { kind: "missing", text: "No remittance advice confirming this is instalment 1 of 2." },
    ],
    escalation: {
      reason: "Amount does not equal any single open invoice.",
      missing: ["Confirmation of instalment schedule"],
      decision: "Apply as partial settlement of INV-2026-197 or hold until remittance advice arrives.",
      options: ["Apply as partial settlement", "Hold pending remittance", "Request remittance advice"],
    },
    accounting: {
      treatment: "Partial accounts receivable settlement (pending confirmation)",
      period: "Sep 2026",
      lines: [
        { account: "1010 · Digital assets — USDC (ops-receivables)", debit: "€2,650.07" },
        { account: "1200 · Accounts receivable — Vela Systems", credit: "€2,650.07" },
      ],
      exportBatch: null,
    },
  },
  {
    id: "rec_01J8YV9K2M",
    hash: "Mv3pQ8LsjR4t…1Ht6",
    network: "Solana",
    slot: "292,388,041",
    timestamp: "2026-09-20 17:58:12 UTC",
    direction: "out",
    wallet: { label: "ops-payables", address: "A2xN9Kd4…7Ye" },
    counterpartyWallet: { label: "helios", address: "9Wc1sT6b…pR3" },
    asset: "USDC",
    amount: "7,320.00",
    fiat: { value: "€6,257.59", rate: "0.854862", source: "ECB reference", time: "17:45 UTC" },
    counterparty: "Helios Contractors",
    entity: "Demo Co. Ltd (UK)",
    invoice: "PAY-0912",
    purpose: "Contractor payment",
    classification: "Accounts payable settlement",
    confidence: 91,
    status: "reconciled",
    reviewer: null,
    decidedBy: "rule · ap_match_v2",
    decidedAt: "2026-09-20 17:58:30 UTC",
    evidence: [
      { kind: "strong", text: "Outgoing amount matches approved payable PAY-0912: 7,320.00 USDC." },
      { kind: "strong", text: "Recipient wallet verified against the vendor master record for Helios Contractors." },
      { kind: "supporting", text: "Payment released by ops-payables after two-person approval (AP-2026-0912)." },
    ],
    accounting: {
      treatment: "Accounts payable settlement",
      period: "Sep 2026",
      lines: [
        { account: "2000 · Accounts payable — Helios Contractors", debit: "€6,257.59" },
        { account: "1013 · Digital assets — USDC (ops-payables)", credit: "€6,257.59" },
      ],
      exportBatch: "EXP-0920-05",
    },
  },
  {
    id: "rec_01J8YT2D8F",
    hash: "Kd7sX5NmzC1q…5Rn2",
    network: "Solana",
    slot: "292,371,690",
    timestamp: "2026-09-20 16:20:47 UTC",
    direction: "out",
    wallet: { label: "treasury-a", address: "9Wc1pR3m…kQ7" },
    counterpartyWallet: { label: "exchange deposit", address: "Ln8vT2Fq…2Tf" },
    asset: "USDT",
    amount: "15,000.00",
    fiat: { value: "€12,822.30", rate: "0.854820", source: "ECB reference", time: "16:15 UTC" },
    counterparty: "Orbit Exchange (deposit cluster)",
    entity: "Demo Co. Ltd (UK)",
    invoice: null,
    purpose: "Undetermined — possible off-ramp",
    classification: "Pending classification",
    confidence: 58,
    status: "review",
    reviewer: "Unassigned",
    decidedBy: "escalated · policy: exchange-bound > €10,000",
    decidedAt: "2026-09-20 16:21:05 UTC",
    evidence: [
      { kind: "strong", text: "Recipient address belongs to a known exchange deposit cluster (Orbit Exchange)." },
      { kind: "missing", text: "No treasury order, payable or transfer instruction references 15,000.00 USDT." },
      { kind: "missing", text: "No approval record found in the treasury workflow." },
    ],
    escalation: {
      reason: "Exchange-bound transfer above the €10,000 policy threshold, with no matching instruction.",
      missing: ["Treasury order or approval", "Economic purpose"],
      decision: "Confirm this is an authorised conversion to fiat, or flag it for treasury investigation.",
      options: ["Link treasury order", "Classify as fiat conversion", "Flag for investigation"],
    },
    accounting: {
      treatment: "Suspense — transfer pending classification",
      period: "Sep 2026",
      lines: [
        { account: "1090 · Digital assets in transit (suspense)", debit: "€12,822.30" },
        { account: "1014 · Digital assets — USDT (treasury-a)", credit: "€12,822.30" },
      ],
      exportBatch: null,
    },
  },
];

export const exceptions = records.filter((r) => r.status === "review");

/** The three canonical states used in the audit view selector. */
export const auditExamples = [
  { id: records[0].id, label: "Automatically reconciled" },
  { id: records[1].id, label: "Requires review" },
  { id: records[2].id, label: "Internal treasury" },
] as const;

export const directionLabel: Record<Direction, string> = {
  in: "Inbound",
  out: "Outbound",
  internal: "Internal",
};
