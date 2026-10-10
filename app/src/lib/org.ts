import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "operator" | "reviewer" | "auditor";
export type Capability = "manage_org" | "import" | "edit_context" | "approve" | "read";

export interface OrgContext {
  userId: string;
  email: string | undefined;
  org: { id: string; name: string; slug: string; base_currency: string; timezone: string; is_demo: boolean };
  role: Role;
  financialRole: Role | null;
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

/** The signed-in user's first organization. Redirects to onboarding when there is none. */
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
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const org = data?.organizations as unknown as OrgContext["org"] | null;
  if (!data || !org) redirect("/onboarding");
  return { userId: user.id, email: user.email, org, role: data.role as Role, financialRole: (data.financial_role as Role | null) ?? null };
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
