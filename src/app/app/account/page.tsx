import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, PageTitle } from "@/components/ui";
import { OrganizationForm, ProfileForm } from "./forms";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, job_title").eq("id", ctx.userId).single();

  return (
    <>
      <PageTitle title="Account" text="Your profile and the organization you belong to." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" text={ctx.email} />
          <div className="p-5">
            <ProfileForm fullName={profile?.full_name ?? ""} jobTitle={profile?.job_title ?? ""} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Organization" text={ctx.role === "owner" ? "Owners can edit these settings." : "Read-only for your role."} />
          <div className="p-5">
            <OrganizationForm
              name={ctx.org.name}
              baseCurrency={ctx.org.base_currency}
              timezone={ctx.org.timezone}
              readOnly={ctx.role !== "owner"}
            />
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
              <dt className="text-fg-muted">Organization ID</dt>
              <dd className="font-mono text-xs">{ctx.org.id}</dd>
              <dt className="text-fg-muted">Slug</dt>
              <dd className="font-mono text-xs">{ctx.org.slug}</dd>
            </dl>
          </div>
        </Card>
      </div>
    </>
  );
}
