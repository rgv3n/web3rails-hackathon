import { Button, Container } from "./ui";

export function FinalCta() {
  return (
    <section className="border-t border-ink-line bg-ink py-20 text-ink-fg sm:py-28">
      <Container>
        <div className="max-w-3xl">
          <h2 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Make onchain finance operational.
          </h2>
          <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-ink-muted">
            Connect blockchain settlement with the financial systems your business already relies on.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="mailto:hello@web3rails.io" variant="inverted" size="lg" arrow>
              Talk to Web3Rails
            </Button>
            <Button
              href="/#architecture"
              size="lg"
              className="border border-ink-line bg-transparent text-ink-fg hover:bg-ink-2"
            >
              View architecture
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
