import { cn } from "@/lib/cn";

export function Logo({ className, invert = false }: { className?: string; invert?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        {/* two rails, one crossing tie: settlement joined to finance */}
        <path d="M3 5h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M3 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M7 5v12M15 5v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M7 11h8" className="text-accent" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span
        className={cn(
          "text-[17px] font-semibold tracking-tight",
          invert ? "text-ink-fg" : "text-fg",
        )}
      >
        Web3Rails
      </span>
    </span>
  );
}
