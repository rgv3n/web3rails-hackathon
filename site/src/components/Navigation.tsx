"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "./ui";
import { cn } from "@/lib/cn";
import { APP_URL } from "@/lib/links";

const links = [
  { href: "/#platform", label: "Platform" },
  { href: "/#solutions", label: "Solutions" },
  { href: "/#developers", label: "Developers" },
  { href: "/#security", label: "Security" },
  { href: "/#company", label: "Company" },
];

export function Navigation() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-200",
        scrolled || open
          ? "border-line bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/75"
          : "border-transparent bg-bg",
      )}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        <Link
          href="/"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          aria-label="Web3Rails home"
        >
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="rounded-md px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 lg:flex">
          <Button href="/#reconciliation" variant="ghost">
            View demo
          </Button>
          <Button href={APP_URL}>Explore the platform</Button>
        </div>

        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-md text-fg lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className="border-t border-line bg-bg lg:hidden">
          <ul className="mx-auto max-w-6xl px-5 py-3">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2 py-3 text-base text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 flex flex-col gap-2 border-t border-line pt-4 pb-2">
              <Button href={APP_URL} size="lg">
                Explore the platform
              </Button>
              <Button href="/#reconciliation" variant="secondary" size="lg">
                View demo
              </Button>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
