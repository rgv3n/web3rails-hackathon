import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "../(auth)/AuthShell";
import { OnboardingForm } from "./OnboardingForm";
import { signOut } from "../(auth)/actions";

export const metadata = { title: "Create organization" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase.from("memberships").select("org_id", { count: "exact", head: true }).eq("user_id", user.id);
  if (count && count > 0) redirect("/app");

  return (
    <AuthShell
      title="Create your organization"
      text="The organization owns wallets, invoices and reconciliation records. You can invite your team later."
      footer={
        <form action={signOut}>
          Signed in as {user.email}.{" "}
          <button className="font-medium text-fg underline-offset-4 hover:underline">Sign out</button>
        </form>
      }
    >
      <OnboardingForm />
    </AuthShell>
  );
}
