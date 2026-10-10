import Link from "next/link";
import { Logo } from "./Logo";
import { Container } from "./ui";

type FooterLink = { label: string; href: string; soon?: boolean };

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "Reconciliation", href: "/#reconciliation" },
      { label: "Financial data", href: "/#platform" },
      { label: "API", href: "/#developers" },
      { label: "Integrations", href: "/#architecture" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Stablecoin payments", href: "/#solutions" },
      { label: "Treasury", href: "/#solutions" },
      { label: "Fintech", href: "/#solutions" },
      { label: "Crypto companies", href: "/#solutions" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/#developers", soon: true },
      { label: "API reference", href: "/#developers" },
      { label: "GitHub", href: "/#developers", soon: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/#company" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg">
      <Container className="py-14">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-muted">
              The financial rails between onchain payments and accounting.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-8 lg:grid-cols-5">
            {columns.map((c) => (
              <div key={c.title}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">{c.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="inline-flex items-center gap-2 py-0.5 text-sm text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {l.label}
                        {l.soon && (
                          <span className="rounded-sm border border-line px-1 font-mono text-[9px] uppercase tracking-wider text-fg-subtle">
                            soon
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Web3Rails. All rights reserved.</p>
          <p className="font-mono">
            Figures on this site are illustrative demo data. No customers, volumes or certifications are implied.
          </p>
        </div>
      </Container>
    </footer>
  );
}
