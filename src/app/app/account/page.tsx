import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, PageTitle } from "@/components/ui";
import { MatchingSettingsForm, OrganizationForm, ProfileForm } from "./forms";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("full_name, job_title").eq("id", ctx.userId).single(),
    supabase.from("organizations").select("matching_tolerance, matching_date_window_days, allow_self_approval").eq("id", ctx.org.id).single(),
  ]);

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
          <CardHeader title="Organization" text={can(ctx, "manage_org") ? "Admins can edit these settings." : "Read-only for your role."} />
          <div className="p-5">
            <OrganizationForm
              name={ctx.org.name}
              baseCurrency={ctx.org.base_currency}
              timezone={ctx.org.timezone}
              readOnly={!can(ctx, "manage_org")}
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
      <Card className="mt-6">
        <CardHeader title="Reconciliation policy" text="Deterministic rules. No default is invented: these values are visible on every proposal." />
        <div className="p-5">
          <MatchingSettingsForm
            tolerance={String(settings?.matching_tolerance ?? "0.01")}
            windowDays={settings?.matching_date_window_days ?? 30}
            allowSelfApproval={settings?.allow_self_approval ?? false}
            readOnly={!can(ctx, "manage_org")}
          />
        </div>
      </Card>
    </>
  );
}
