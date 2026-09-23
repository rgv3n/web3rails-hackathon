import { Container, Section, SectionHeading } from "./ui";

export function Company() {
  return (
    <Section id="company">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionHeading
              eyebrow="Company"
              title="Building infrastructure for the convergence of traditional and onchain finance."
              lede={
                <>
                  Web3Rails is focused on one fundamental infrastructure problem: making
                  blockchain-native financial activity usable by the systems, teams and institutions
                  that operate modern finance.
                </>
              }
            />
          </div>
          <dl className="grid gap-6 self-end sm:grid-cols-2 lg:col-span-5">
            <div className="border-t border-line pt-4">
              <dt className="text-xs text-fg-subtle">Stage</dt>
              <dd className="mt-1 text-base font-medium text-fg">Early. MVP in development.</dd>
            </div>
            <div className="border-t border-line pt-4">
              <dt className="text-xs text-fg-subtle">First product</dt>
              <dd className="mt-1 text-base font-medium text-fg">Stablecoin reconciliation on Solana</dd>
            </div>
            <div className="border-t border-line pt-4">
              <dt className="text-xs text-fg-subtle">Who we talk to</dt>
              <dd className="mt-1 text-base font-medium text-fg">CFOs, controllers, fintech and payments teams</dd>
            </div>
            <div className="border-t border-line pt-4">
              <dt className="text-xs text-fg-subtle">Contact</dt>
              <dd className="mt-1 text-base font-medium text-fg">
                <a href="mailto:hello@web3rails.io" className="underline decoration-line-strong underline-offset-4 hover:decoration-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  hello@web3rails.io
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </Container>
    </Section>
  );
}
