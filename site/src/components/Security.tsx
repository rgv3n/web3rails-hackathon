import { controls } from "@/lib/demo-data";
import { Container, Section, SectionHeading } from "./ui";

export function Security() {
  return (
    <Section id="security">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionHeading
              eyebrow="Security and controls"
              title="Designed for financial control."
              lede="Controls are part of the data model, not a layer added afterwards. Every record carries its evidence, its provenance and the decision that produced it."
            />
            <div className="mt-8 border-l-2 border-line-strong pl-4 text-sm leading-relaxed text-fg-muted">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">Certifications</p>
              <p className="mt-2">
                Web3Rails does not currently hold SOC 2 or ISO 27001 certifications. They will be
                stated here when obtained, not before.
              </p>
            </div>
          </div>
          <dl className="divide-y divide-line border-y border-line lg:col-span-8">
            {controls.map((c, i) => (
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
