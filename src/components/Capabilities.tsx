import { capabilities } from "@/lib/demo-data";
import { Container, Section, SectionHeading } from "./ui";

export function Capabilities() {
  return (
    <Section tone="muted">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionHeading
              eyebrow="Capabilities"
              title="One record, used by every finance function."
              lede="Reconciliation is the entry point. The same structured record serves accounting, treasury and audit."
            />
            <div className="mt-8 border-l-2 border-accent pl-4 text-sm leading-relaxed text-fg-muted">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">Scope today</p>
              <p className="mt-2">
                Solana and stablecoin reconciliation. Other networks, ERP connectors and treasury
                workflows are labelled prototype or planned in the architecture below.
              </p>
            </div>
          </div>
          <dl className="divide-y divide-line border-y border-line lg:col-span-8">
            {capabilities.map((c, i) => (
              <div key={c.name} className="grid gap-2 py-5 sm:grid-cols-[2.5rem_1fr_1.6fr] sm:gap-6">
                <span className="font-mono text-xs text-fg-subtle tabular">0{i + 1}</span>
                <dt className="text-base font-semibold text-fg">{c.name}</dt>
                <dd className="text-sm leading-relaxed text-fg-muted">{c.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </Section>
  );
}
