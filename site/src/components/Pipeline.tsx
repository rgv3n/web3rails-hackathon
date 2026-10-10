import { pipelineStages } from "@/lib/demo-data";
import { Container, Section, SectionHeading } from "./ui";

export function Pipeline() {
  return (
    <Section id="platform">
      <Container>
        <SectionHeading
          eyebrow="Platform"
          title="From onchain activity to financial records."
          lede="One processing path. Each stage adds structure, and every decision along it is recorded so it can be reviewed later."
        />

        <ol className="relative mt-14 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4 xl:grid-cols-7">
          {pipelineStages.map((s, i) => (
            <li key={s.name} className="relative bg-surface p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-fg-subtle tabular">0{i + 1}</span>
                <span
                  className="size-1.5 rounded-full bg-accent"
                  style={{ opacity: 0.35 + (i / (pipelineStages.length - 1)) * 0.65 }}
                  aria-hidden
                />
              </div>
              <h3 className="mt-6 text-base font-semibold text-fg">{s.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.text}</p>
            </li>
          ))}
          {/* filler keeps the 4-column grid closed between md and xl */}
          <li aria-hidden className="hidden bg-surface md:block xl:hidden" />
        </ol>
      </Container>
    </Section>
  );
}
