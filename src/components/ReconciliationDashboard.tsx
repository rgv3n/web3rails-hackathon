import { Container, DemoLabel, Section, SectionHeading } from "./ui";
import { ProductDemo } from "./ProductDemo";

const model = [
  { n: "93.2%", text: "of transactions reconciled automatically, with the evidence attached." },
  { n: "6.8%", text: "escalated as exceptions. This is where the finance team spends its time." },
  { n: "100%", text: "of decisions reviewable and reversible, automatic or human." },
];

export function ReconciliationDashboard() {
  return (
    <Section id="reconciliation" tone="muted">
      <Container wide>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow="Reconciliation · first product"
            title="Reconciliation built for onchain finance."
            lede="Management by exception. Web3Rails reconciles high-confidence transactions on its own. Finance teams spend their time only on the ambiguous ones, with the evidence and the missing pieces laid out."
          />
          <DemoLabel />
        </div>

        <dl className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
          {model.map((m) => (
            <div key={m.n} className="bg-surface px-5 py-4">
              <dt className="text-2xl font-semibold tracking-tight text-fg tabular">{m.n}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-fg-muted">{m.text}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6">
          <ProductDemo />
        </div>

        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-fg-muted">
          A blockchain transaction shows that money moved. Web3Rails explains what that movement
          means financially, and keeps the proof.
        </p>
      </Container>
    </Section>
  );
}
