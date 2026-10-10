import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for the Web3Rails website.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PageShell eyebrow="Legal" title="Website terms of use." lede="These terms apply to the web3rails.io website. Last updated 23 September 2026.">
      <h2>Informational content</h2>
      <p>
        The content of this website describes a product in development. Dashboards, figures,
        transactions, counterparties and API responses shown on the site are illustrative demo data.
        They do not represent real customers, volumes or outcomes.
      </p>
      <h2>No financial, legal or accounting advice</h2>
      <p>
        Nothing on this website is financial, legal, tax or accounting advice. Accounting treatment
        of onchain activity depends on your jurisdiction and your auditors.
      </p>
      <h2>Product availability</h2>
      <p>
        Capabilities labelled as prototype or planned are not commitments. Use of the Web3Rails
        product is governed by a separate agreement.
      </p>
      <h2>Intellectual property</h2>
      <p>
        The Web3Rails name, logo and website content belong to Web3Rails. You may link to this site
        and quote it with attribution.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href="mailto:hello@web3rails.io">hello@web3rails.io</a>.
      </p>
    </PageShell>
  );
}
