import { visionLayers } from "@/lib/demo-data";
import { Container, Section, SectionHeading } from "./ui";
import { cn } from "@/lib/cn";

export function Vision() {
  return (
    <Section tone="muted">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionHeading
              eyebrow="Vision"
              title={
                <>
                  Blockchain is becoming a settlement layer.
                  <span className="block text-fg-muted">
                    Web3Rails is building the financial operations layer above it.
                  </span>
                </>
              }
              lede="As stablecoins, tokenized assets and programmable money become part of mainstream financial infrastructure, organizations need systems that connect onchain settlement with accounting, treasury, controls and reporting. Web3Rails is building that connective infrastructure."
            />
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
              Platform direction · not all layers exist today
            </p>
            <ol className="relative">
              <span className="absolute top-3 bottom-3 left-[7px] w-px bg-line-strong" aria-hidden />
              {visionLayers.map((l, i) => {
                const current = i === 0;
                const active = i <= 1;
                return (
                  <li key={l.name} className="relative flex items-center gap-4 py-2.5 pl-8">
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 size-[15px] -translate-y-1/2 rounded-full border-2 bg-bg",
                        current ? "border-accent bg-accent" : active ? "border-accent" : "border-line-strong",
                      )}
                      aria-hidden
                    />
                    <span className={cn("flex-1 text-base font-medium", active ? "text-fg" : "text-fg-muted")}>{l.name}</span>
                    <span
                      className={cn(
                        "font-mono text-[10px] uppercase tracking-wider",
                        current ? "text-accent" : "text-fg-subtle",
                      )}
                    >
                      {l.state}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </Container>
    </Section>
  );
}
