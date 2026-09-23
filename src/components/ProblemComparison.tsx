import { ArrowDown, ArrowRight } from "lucide-react";
import { Container, Section, SectionHeading } from "./ui";

const raw: [string, string][] = [
  ["amount", "5,000 USDC"],
  ["from", "7jK9d2Rf…x32"],
  ["to", "F91bA8cQ…19A"],
  ["network", "Solana"],
  ["slot", "292,481,006"],
  ["time", "14:32:17 UTC"],
];

const context: [string, string][] = [
  ["Direction", "Inbound · ops-receivables"],
  ["Counterparty", "Acme Ltd."],
  ["Entity", "Demo Co. Ltd (UK)"],
  ["Invoice", "INV-2026-192"],
  ["Economic purpose", "Customer payment"],
  ["Fiat value", "€4,274.31 · ECB 14:15 UTC"],
  ["Confidence", "0.98 · 4 pieces of evidence"],
];

const record: [string, string][] = [
  ["Dr 1010 Digital assets — USDC", "€4,274.31"],
  ["Cr 1200 Accounts receivable — Acme", "€4,274.31"],
  ["Treatment", "AR settlement"],
  ["Period", "Sep 2026"],
  ["Decided by", "rule · ar_match_v3"],
  ["Export batch", "EXP-0921-03"],
];

function Connector() {
  return (
    <div className="flex items-center justify-center py-1 lg:flex-col lg:px-0" aria-hidden>
      <ArrowRight className="hidden size-4 text-accent lg:block" />
      <ArrowDown className="size-4 text-accent lg:hidden" />
    </div>
  );
}

function Panel({
  step,
  eyebrow,
  title,
  rows,
  foot,
  tone = "light",
  mono = false,
}: {
  step: string;
  eyebrow: string;
  title: string;
  rows: [string, string][];
  foot: string;
  tone?: "light" | "ink";
  mono?: boolean;
}) {
  const ink = tone === "ink";
  return (
    <div
      className={
        ink
          ? "flex flex-col rounded-lg border border-ink-line bg-ink p-6 text-ink-fg"
          : "flex flex-col rounded-lg border border-line bg-surface p-6"
      }
    >
      <p className={`flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.18em] ${ink ? "text-ink-muted" : "text-fg-subtle"}`}>
        <span className="tabular">{step}</span>
        <span>{eyebrow}</span>
      </p>
      <h3 className={`mt-2 text-lg font-medium ${ink ? "text-ink-fg" : "text-fg"}`}>{title}</h3>
      <dl className={`mt-5 flex-1 space-y-2.5 ${mono ? "font-mono text-[13px]" : "text-sm"}`}>
        {rows.map(([k, v]) => (
          <div key={k} className={`flex items-baseline justify-between gap-4 border-b pb-2.5 ${ink ? "border-ink-line" : "border-line"}`}>
            <dt className={ink ? "text-ink-muted" : "text-fg-muted"}>{k}</dt>
            <dd className={`text-right ${ink ? "text-ink-fg" : "font-medium text-fg"} ${mono || k.startsWith("Dr") || k.startsWith("Cr") ? "font-mono text-xs tabular" : ""}`}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <p className={`mt-5 text-sm leading-relaxed ${ink ? "text-ink-muted" : "text-fg-muted"}`}>{foot}</p>
    </div>
  );
}

export function ProblemComparison() {
  return (
    <Section id="problem" tone="muted">
      <Container>
        <SectionHeading
          eyebrow="The problem"
          title="A blockchain transaction is not an accounting record."
          lede="A transaction proves that value moved. It does not say who paid, what for, at what fiat value, or how it should be booked. Web3Rails adds the financial context and produces the record."
        />

        <div className="mt-12 grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-4">
          <Panel
            step="01"
            eyebrow="Raw blockchain activity"
            title="What the chain records"
            rows={raw}
            foot="Proof of movement. No counterparty, no purpose, no fiat value, no accounting meaning."
            tone="ink"
            mono
          />
          <Connector />
          <Panel
            step="02"
            eyebrow="Financial context"
            title="What Web3Rails resolves"
            rows={context}
            foot="Who, what for, at what value, with how much confidence. Each field points to its evidence."
          />
          <Connector />
          <Panel
            step="03"
            eyebrow="Accounting-ready record"
            title="What finance books"
            rows={record}
            foot="Balanced journal lines, period, decision rule and export batch. Ready for the ledger and for the auditor."
          />
        </div>
      </Container>
    </Section>
  );
}
