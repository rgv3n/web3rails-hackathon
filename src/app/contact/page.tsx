import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui";

export const metadata: Metadata = {
  title: "Contact",
  description: "Talk to Web3Rails about stablecoin reconciliation and onchain financial operations.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <PageShell
      eyebrow="Contact"
      title="Talk to Web3Rails."
      lede="We are working with a small number of finance and payments teams while the reconciliation product is in development."
    >
      <p>
        The most useful conversations start with a concrete question: which wallets, which
        stablecoins, which accounting system, and how reconciliation is done today. Write to us with
        that and we will answer directly.
      </p>
      <p>
        <Button href="mailto:hello@web3rails.io" size="lg" arrow>
          hello@web3rails.io
        </Button>
      </p>
      <h2>What to expect</h2>
      <ul>
        <li>A reply from the founding team, not a sales sequence.</li>
        <li>A frank account of what the product does today and what is still planned.</li>
        <li>No commitments implied about networks, integrations or timelines we have not built.</li>
      </ul>
    </PageShell>
  );
}
