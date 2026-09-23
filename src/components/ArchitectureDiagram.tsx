import { architecture, maturityLabel, type Maturity } from "@/lib/demo-data";
import { Container, MaturityTag, Section, SectionHeading } from "./ui";

function Tier({
  n,
  title,
  caption,
  nodes,
  emphasized,
}: {
  n: string;
  title: string;
  caption: string;
  nodes: { name: string; maturity: Maturity }[];
  emphasized?: boolean;
}) {
  return (
    <div
      className={
        emphasized
          ? "rounded-lg border border-accent/40 bg-ink-2 p-5 ring-1 ring-accent/20 sm:p-6"
          : "rounded-lg border border-ink-line bg-ink-2/60 p-5 sm:p-6"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-baseline gap-3">
          <span className="font-mono text-xs text-ink-muted tabular">{n}</span>
          <span className={emphasized ? "text-base font-semibold text-accent-strong" : "text-base font-semibold text-ink-fg"}>{title}</span>
        </h3>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">{caption}</p>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {nodes.map((n) => (
          <li
            key={n.name}
            className="inline-flex items-center gap-2 rounded-md border border-ink-line bg-ink px-3 py-2 text-sm text-ink-fg"
          >
            {n.name}
            <MaturityTag maturity={n.maturity} invert />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1 pl-6" aria-hidden>
      <svg viewBox="0 0 12 36" className="h-9 w-3 shrink-0">
        <line x1="6" y1="0" x2="6" y2="30" stroke="var(--ink-line)" strokeWidth="2" />
        <line x1="6" y1="0" x2="6" y2="30" stroke="var(--accent)" strokeWidth="2" className="rail-anim" />
        <path d="M1 28 L6 35 L11 28" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      </svg>
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">{label}</span>
    </div>
  );
}

export function ArchitectureDiagram() {
  const legend: Maturity[] = ["mvp", "prototype", "planned"];
  const legendText: Record<Maturity, string> = {
    mvp: "working in the current product",
    prototype: "built, not yet production-ready",
    planned: "platform direction, not yet built",
  };
  return (
    <Section id="architecture" tone="ink">
      <Container>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            invert
            eyebrow="Architecture"
            title="A financial operations layer for onchain settlement."
            lede="Extensible by design. Honest about what exists: the current MVP is Solana plus stablecoin reconciliation."
          />
          <ul className="flex flex-col gap-2 text-xs text-ink-muted">
            {legend.map((m) => (
              <li key={m} className="flex items-center gap-2">
                <MaturityTag maturity={m} invert />
                <span>
                  {maturityLabel[m]} · {legendText[m]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-12">
          <Tier n="01" {...architecture[0]} />
          <Connector label="settlement data · read-only" />
          <Tier n="02" {...architecture[1]} emphasized />
          <Connector label="structured financial records · API, exports" />
          <Tier n="03" {...architecture[2]} />
        </div>
      </Container>
    </Section>
  );
}
