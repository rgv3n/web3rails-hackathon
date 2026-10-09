"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Building2, Cable, ClipboardList, LayoutDashboard, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const items = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/app/movements", label: "Movements", icon: ArrowLeftRight },
  { href: "/app/organization", label: "Organization", icon: Building2 },
  { href: "/app/integrations", label: "Integrations & API", icon: Cable },
  { href: "/app/account", label: "Account", icon: UserRound },
  { href: "/app/team", label: "Team", icon: Users },
  { href: "/app/audit", label: "Audit log", icon: ClipboardList },
];

export function AppNav({ horizontal = false }: { horizontal?: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      className={cn(
        horizontal ? "flex gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-1.5" : "flex flex-col gap-0.5 px-3 py-3",
      )}
    >
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm transition",
              active ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-accent-strong" : "text-fg-subtle")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
