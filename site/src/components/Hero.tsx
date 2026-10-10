import { Button, Container, Eyebrow } from "./ui";
import { InfrastructureFlow } from "./InfrastructureFlow";
import { APP_URL } from "@/lib/links";

export function Hero() {
  return (
    <section className="relative">
      <Container className="pt-14 pb-16 sm:pt-20 sm:pb-24">
        <div className="max-w-3xl">
          <Eyebrow className="fade-up mb-5">Financial operations layer for onchain settlement</Eyebrow>
          <h1 className="fade-up fade-up-2 text-balance text-[2.5rem] font-semibold leading-[1.04] tracking-[-0.03em] text-fg sm:text-5xl lg:text-6xl">
            Infrastructure for onchain finance.
          </h1>
          <p className="fade-up fade-up-3 mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-fg-muted sm:text-xl">
            Web3Rails connects blockchain-native money movement with accounting, treasury,
            reporting and financial control.
          </p>
          <div className="fade-up fade-up-3 mt-8 flex flex-wrap items-center gap-3">
            <Button href={APP_URL} size="lg" arrow>
              Explore the platform
            </Button>
            <Button href="/#overview" size="lg" variant="secondary">
              See how it works
            </Button>
          </div>
        </div>

        <div className="mt-16 border-t border-line pt-10 sm:mt-20 sm:pt-12">
          <InfrastructureFlow />
        </div>
      </Container>
    </section>
  );
}
