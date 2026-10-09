import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-fg text-bg hover:opacity-90",
    secondary: "border border-line-strong bg-surface text-fg hover:bg-surface-2",
    ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
    danger: "border border-line-strong bg-surface text-warn hover:bg-warn-soft",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-strong focus:outline-none focus:ring-2 focus:ring-accent-soft",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus:border-accent-strong focus:outline-none focus:ring-2 focus:ring-accent-soft",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-fg-subtle">{hint}</span> : null}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-line bg-surface", className)}>{children}</div>;
}

export function CardHeader({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {text ? <p className="mt-0.5 text-sm text-fg-muted">{text}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "accent"; children: ReactNode }) {
  const styles = {
    neutral: "bg-surface-2 text-fg-muted border-line",
    ok: "bg-ok-soft text-ok border-transparent",
    warn: "bg-warn-soft text-warn border-transparent",
    accent: "bg-accent-soft text-accent-strong border-transparent",
  }[tone];
  return (
    <span className={cn("inline-flex h-5 items-center rounded border px-1.5 text-[11px] font-medium leading-none", styles)}>
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "ok"; children: ReactNode }) {
  const styles = {
    neutral: "border-line bg-surface-2 text-fg-muted",
    warn: "border-transparent bg-warn-soft text-warn",
    ok: "border-transparent bg-ok-soft text-ok",
  }[tone];
  return <div className={cn("rounded-md border px-3 py-2 text-sm", styles)}>{children}</div>;
}

export function PageTitle({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {text ? <p className="mt-1 text-sm text-fg-muted">{text}</p> : null}
      </div>
      {action}
    </div>
  );
}
