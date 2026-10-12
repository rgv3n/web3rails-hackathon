"use server";

import { redirect } from "next/navigation";
import { setActiveOrganization } from "@/app/app/actions";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/org";

export interface OnboardingState {
  error?: string;
}

export async function createOrganization(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  const baseCurrency = String(formData.get("base_currency") ?? "EUR");
  const timezone = String(formData.get("timezone") ?? "Europe/Madrid");
  if (name.length < 2) return { error: "Organization name is required." };
  if (!["EUR", "USD"].includes(baseCurrency)) return { error: "Unsupported base currency." };

  const supabase = await createClient();
  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
  const taxId = String(formData.get("tax_id") ?? "").trim().toUpperCase().replace(/[\s-]/g, "") || null;
  if (taxId && !/^[A-Z0-9]{5,20}$/.test(taxId)) return { error: "Tax id: letters and digits only, 5 to 20 characters." };
  const { data: orgId, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_slug: slug,
    p_base_currency: baseCurrency,
    p_timezone: timezone,
    p_tax_id: taxId,
  });
  if (error) return { error: error.message };
  // The new organization becomes the active one.
  if (typeof orgId === "string") await setActiveOrganization(orgId);
  redirect("/app");
}
