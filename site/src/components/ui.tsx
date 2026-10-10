import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Maturity } from "@/lib/demo-data";
import { maturityLabel } from "@/lib/demo-data";

export function Container({
  className,
  children,
  wide = false,
}: {
  className?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("mx-auto w-full px-5 sm:px-8", wide ? "max-w-7xl" : "max-w-6xl", className)}>
      {children}
    </div>
  );
}

export function Section({
  id,
  className,
  children,
  tone = "default",
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  tone?: "default" | "muted" | "ink";
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-20 border-t border-line py-20 sm:py-28",
        tone === "muted" && "bg-surface-2",
        tone === "ink" && "border-ink-line bg-ink text-ink-fg",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-accent-strong",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "left",
  invert = false,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  invert?: boolean;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
      )}
    >
      {eyebrow && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
      <h2
        className={cn(
          "text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl",
          invert ? "text-ink-fg" : "text-fg",
        )}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={cn(
            "mt-5 text-pretty text-base leading-relaxed sm:text-lg",
            invert ? "text-ink-muted" : "text-fg-muted",
          )}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

type ButtonProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "inverted";
  size?: "md" | "lg";
  arrow?: boolean;
  className?: string;
};

export function Button({
  href,
  children,
  variant = "primary",
  size = "md",
  arrow = false,
  className,
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
  const sizes = {
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-5 text-[15px]",
  };
  const variants = {
    primary: "bg-fg text-bg hover:bg-fg/90",
    secondary:
      "border border-line-strong bg-surface text-fg hover:border-fg/40 hover:bg-surface-2",
    ghost: "text-fg hover:bg-surface-2",
    inverted: "bg-ink-fg text-ink hover:bg-white",
  };
  const isExternal = href.startsWith("http") || href.startsWith("mailto:");
  const cls = cn(base, sizes[size], variants[variant], className);
  if (isExternal) {
    return (
      <a href={href} className={cls}>
        {children}
        {arrow && <ArrowRight className="size-4" aria-hidden />}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
      {arrow && <ArrowRight className="size-4" aria-hidden />}
    </Link>
  );
}

export function MaturityTag({
  maturity,
  invert = false,
}: {
  maturity: Maturity;
  invert?: boolean;
}) {
  const styles: Record<Maturity, string> = {
    mvp: invert
      ? "bg-accent/20 text-accent-strong ring-accent/40"
      : "bg-accent-soft text-accent-strong ring-accent/30",
    prototype: invert
      ? "bg-white/5 text-ink-fg ring-white/20"
      : "bg-surface text-fg-muted ring-line-strong",
    planned: invert
      ? "bg-transparent text-ink-muted ring-ink-line"
      : "bg-transparent text-fg-subtle ring-line",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset",
        styles[maturity],
      )}
    >
      {maturityLabel[maturity]}
    </span>
  );
}

export function DemoLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-subtle",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-warn" aria-hidden />
      Demo data · illustrative
    </span>
  );
}
