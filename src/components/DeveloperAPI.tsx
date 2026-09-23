import { apiEndpoints, apiSample, webhookEvents, webhookSample } from "@/lib/demo-data";
import { Container, Section, SectionHeading } from "./ui";

function CodeWindow({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-line bg-ink-2">
      <div className="flex items-center justify-between border-b border-ink-line px-4 py-2.5">
        <span className="font-mono text-xs text-ink-fg">{title}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">application/json</span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-ink-fg">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function DeveloperAPI() {
  return (
    <Section id="developers" tone="ink">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading
              invert
              eyebrow="Developers"
              title="Infrastructure your systems can build on."
              lede="Structured records over a plain REST API, with webhooks for the moments finance cares about. Illustrative API design. It will change before general availability."
            />

            <h3 className="mt-10 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">Endpoints</h3>
            <ul className="mt-3 divide-y divide-ink-line border-y border-ink-line">
              {apiEndpoints.map((e) => (
                <li key={e.path} className="flex items-center gap-4 py-3 font-mono text-[13px]">
                  <span className="w-12 shrink-0 text-accent-strong">{e.method}</span>
                  <span className="text-ink-fg">{e.path}</span>
                  <span className="ml-auto hidden text-right font-sans text-xs text-ink-muted sm:block">{e.text}</span>
                </li>
              ))}
            </ul>

            <h3 className="mt-8 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted">Webhook events</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {webhookEvents.map((w) => (
                <li key={w} className="rounded-md border border-ink-line bg-ink px-2.5 py-1.5 font-mono text-xs text-ink-fg">
                  {w}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4 lg:col-span-7">
            <CodeWindow title="GET /reconciliations/rec_01J8Z3K9Q4" code={apiSample} />
            <CodeWindow title="webhook · reconciliation.requires_review" code={webhookSample} />
          </div>
        </div>
      </Container>
    </Section>
  );
}
