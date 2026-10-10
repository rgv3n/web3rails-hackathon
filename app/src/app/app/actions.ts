"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

/** Switch the active organization. Only organizations the user belongs to are accepted; anything else is ignored. */
export async function switchOrganization(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("memberships").select("org_id").eq("user_id", user.id).eq("org_id", orgId).maybeSingle();
  if (data) await setActiveOrganization(orgId);
  redirect("/app");
}

export async function setActiveOrganization(orgId: string) {
  (await cookies()).set(ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}
