import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "reviewer" | "auditor";

export interface OrgContext {
  userId: string;
  email: string | undefined;
  org: { id: string; name: string; slug: string; base_currency: string; timezone: string; is_demo: boolean };
  role: Role;
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
    .select("role, organizations(id, name, slug, base_currency, timezone, is_demo)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const org = data?.organizations as unknown as OrgContext["org"] | null;
  if (!data || !org) redirect("/onboarding");
  return { userId: user.id, email: user.email, org, role: data.role as Role };
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
