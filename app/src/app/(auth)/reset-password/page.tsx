import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "../AuthShell";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=link-expired");

  return (
    <AuthShell title="Choose a new password" text={`Signed in as ${user.email}. The new password applies immediately.`} footer={<span>Minimum 8 characters.</span>}>
      <ResetPasswordForm />
    </AuthShell>
  );
}
