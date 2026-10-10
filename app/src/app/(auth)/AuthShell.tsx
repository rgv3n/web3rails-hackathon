import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export function AuthShell({ title, text, children, footer }: { title: string; text: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="https://web3rails.io" className="mb-8 inline-block">
          <Logo />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-fg-muted">{text}</p>
        <div className="mt-6 rounded-lg border border-line bg-surface p-5">{children}</div>
        <div className="mt-4 text-sm text-fg-muted">{footer}</div>
      </div>
    </main>
  );
}
