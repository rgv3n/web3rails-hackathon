import { useCases } from "@/lib/demo-data";
import { Container, Section, SectionHeading } from "./ui";

export function UseCases() {
  return (
    <Section id="solutions">
      <Container>
        <SectionHeading
          eyebrow="Solutions"
          title="Built for organizations moving finance onchain."
        />
        <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((u, i) => (
            <li key={u.name} className="border-t border-line pt-5">
              <span className="font-mono text-xs text-fg-subtle tabular">0{i + 1}</span>
              <h3 className="mt-3 text-lg font-semibold text-fg">{u.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{u.text}</p>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
