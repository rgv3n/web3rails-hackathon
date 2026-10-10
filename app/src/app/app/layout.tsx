import type { ReactNode } from "react";
import { requireOrg } from "@/lib/org";
import { AppNav } from "./AppNav";
import { Logo } from "@/components/Logo";
import { signOut } from "../(auth)/actions";
import { Badge } from "@/components/ui";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrg();
  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-14 items-center border-b border-line px-5">
          <Logo />
        </div>
        <div className="border-b border-line px-5 py-3">
          <p className="truncate text-sm font-medium">{ctx.org.name}</p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-fg-subtle">
            <span className="capitalize">{ctx.role}</span>
            {ctx.org.is_demo ? <Badge tone="accent">Demo data</Badge> : null}
          </p>
        </div>
        <AppNav />
        <form action={signOut} className="mt-auto border-t border-line px-5 py-3">
          <p className="truncate text-xs text-fg-subtle">{ctx.email}</p>
          <button className="mt-1 text-xs font-medium text-fg-muted hover:text-fg">Sign out</button>
        </form>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
          <Logo />
          <form action={signOut}>
            <button className="text-xs font-medium text-fg-muted">Sign out</button>
          </form>
        </header>
        <div className="md:hidden">
          <AppNav horizontal />
        </div>
        <main id="main" className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
