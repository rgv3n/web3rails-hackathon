import type { ReactNode } from "react";
import { Navigation } from "./Navigation";
import { Footer } from "./Footer";
import { Container, Eyebrow } from "./ui";

export function PageShell({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Navigation />
      <main id="main" className="flex-1">
        <Container className="py-16 sm:py-24">
          <div className="max-w-2xl">
            <Eyebrow className="mb-4">{eyebrow}</Eyebrow>
            <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-fg sm:text-5xl">
              {title}
            </h1>
            {lede && <p className="mt-5 text-lg leading-relaxed text-fg-muted">{lede}</p>}
          </div>
          <div className="prose-w3r mt-12 max-w-2xl space-y-5 text-[15px] leading-relaxed text-fg-muted [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fg [&_a]:text-fg [&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:pl-5">
            {children}
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
