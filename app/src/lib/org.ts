import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Cookie that remembers which of the user's organizations is active. Validated against memberships on every request. */
export const ORG_COOKIE = "w3r_org";

export type Role = "admin" | "operator" | "reviewer" | "auditor";
export type Capability = "manage_org" | "import" | "edit_context" | "approve" | "read";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  base_currency: string;
  timezone: string;
  is_demo: boolean;
}
export interface OrgContext {
  userId: string;
  email: string | undefined;
  org: OrgSummary;
  role: Role;
  financialRole: Role | null;
  /** Every organization the user belongs to, oldest first (for the switcher). */
  organizations: OrgSummary[];
}

/** Effective roles = membership role ∪ explicit financial role. Mirrors public.has_role in the database. */
export function roles(ctx: Pick<OrgContext, "role" | "financialRole">): Role[] {
  return ctx.financialRole ? [ctx.role, ctx.financialRole] : [ctx.role];
}

/** Capability check for UI affordances only. The database functions and RLS enforce the real rules. */
export function can(ctx: Pick<OrgContext, "role" | "financialRole">, cap: Capability): boolean {
  const r = roles(ctx);
  switch (cap) {
    case "read":
      return true;
    case "manage_org":
      return r.includes("admin");
    case "import":
      return r.includes("admin") || r.includes("operator");
    case "edit_context":
      return r.includes("operator") || r.includes("reviewer");
    case "approve":
      return r.includes("reviewer");
  }
}

/**
 * The active organization: the one named by the ORG_COOKIE if the user is a member of it, otherwise the oldest membership.
 * Redirects to onboarding when the user belongs to none.
 */
export async function requireOrg(): Promise<OrgContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("memberships")
    .select("role, financial_role, organizations(id, name, slug, base_currency, timezone, is_demo)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const rows = (data ?? []).filter((r) => r.organizations) as unknown as Array<{ role: Role; financial_role: Role | null; organizations: OrgSummary }>;
  if (rows.length === 0) redirect("/onboarding");

  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const active = rows.find((r) => r.organizations.id === wanted) ?? rows[0];
  return {
    userId: user.id,
    email: user.email,
    org: active.organizations,
    role: active.role,
    financialRole: active.financial_role ?? null,
    organizations: rows.map((r) => r.organizations),
  };
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}
