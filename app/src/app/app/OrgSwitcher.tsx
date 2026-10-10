"use client";

import { useRef } from "react";
import { switchOrganization } from "./actions";
import type { OrgSummary } from "@/lib/org";

export function OrgSwitcher({ organizations, activeId, compact = false }: { organizations: OrgSummary[]; activeId: string; compact?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  if (organizations.length <= 1) return null;
  return (
    <form ref={form} action={switchOrganization} className={compact ? "" : "mt-2"}>
      <label className="sr-only" htmlFor="org-switcher">Organization</label>
      <select
        id="org-switcher"
        name="org_id"
        defaultValue={activeId}
        onChange={() => form.current?.requestSubmit()}
        className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}{o.is_demo ? " (demo)" : ""}
          </option>
        ))}
      </select>
      <noscript>
        <button className="mt-1 text-xs font-medium text-fg-muted">Switch</button>
      </noscript>
    </form>
  );
}
