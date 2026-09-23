import { cfoQuestions } from "@/lib/demo-data";
import { Container, Section, SectionHeading } from "./ui";

export function CfoQuestions() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="For finance teams"
          title="Your finance team shouldn't need to read a block explorer."
          lede="These are the questions a controller asks about every payment. A block explorer answers none of them."
        />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {cfoQuestions.map((q, i) => (
            <li key={q} className="bg-surface p-5">
              <span className="font-mono text-xs text-fg-subtle tabular">0{i + 1}</span>
              <p className="mt-4 text-balance text-lg font-medium leading-snug text-fg">{q}</p>
            </li>
          ))}
        </ol>
        <p className="mt-10 max-w-2xl text-xl font-medium leading-snug tracking-tight text-fg sm:text-2xl">
          Web3Rails turns blockchain activity into financial context.
        </p>
      </Container>
    </Section>
  );
}
