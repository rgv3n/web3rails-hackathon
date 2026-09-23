import { Container, Section, SectionHeading } from "./ui";

const constants = ["Reconciliation", "Accounting", "Reporting", "Controls", "Auditability"];

export function Thesis() {
  return (
    <Section>
      <Container>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <SectionHeading
              eyebrow="Thesis"
              title={
                <>
                  Financial infrastructure is moving onchain.
                  <br className="hidden sm:block" /> Financial operations still need controls.
                </>
              }
              lede="Settlement is getting faster, programmable and global. The obligations of a finance team do not change with it. What changes is the distance between where value settles and where it is accounted for. That distance is the infrastructure gap."
            />
          </div>
          <div className="lg:col-span-5">
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
              Settlement innovation does not remove
            </p>
            <ul className="divide-y divide-line border-y border-line">
              {constants.map((c, i) => (
                <li key={c} className="flex items-center justify-between py-4">
                  <span className="text-lg font-medium text-fg">{c}</span>
                  <span className="font-mono text-xs text-fg-subtle tabular">0{i + 1}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-fg-muted">
              It makes the connective infrastructure between settlement and these functions more
              important, not less.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
