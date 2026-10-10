"use server";

import { redirect } from "next/navigation";
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
  const { error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_slug: slug,
    p_base_currency: baseCurrency,
    p_timezone: timezone,
  });
  if (error) return { error: error.message };
  redirect("/app");
}
