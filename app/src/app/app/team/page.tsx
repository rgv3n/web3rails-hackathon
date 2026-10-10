import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardHeader, Notice, PageTitle } from "@/components/ui";

export const metadata = { title: "Team" };

const roleText: Record<string, string> = {
  owner: "Everything, including members and organization settings.",
  reviewer: "Wallets, invoices, resolving exceptions, exports.",
  auditor: "Read-only access to everything, including the audit log.",
};

export default async function TeamPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("memberships")
    .select("user_id, role, created_at, profiles:profiles!memberships_user_profile_fkey(full_name, job_title)")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: true });

  return (
    <>
      <PageTitle title="Team" text="Who can access this organization and with which role." />
      <Card>
        <CardHeader title="Members" action={<Badge>Invitations: in development</Badge>} />
        <ul className="divide-y divide-line">
          {(members ?? []).map((m) => {
            const p = m.profiles as unknown as { full_name: string | null; job_title: string | null } | null;
            return (
              <li key={m.user_id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{p?.full_name ?? "—"}{m.user_id === ctx.userId ? <span className="text-fg-subtle"> (you)</span> : null}</p>
                  <p className="text-fg-muted">{p?.job_title ?? ""}</p>
                </div>
                <Badge tone={m.role === "admin" ? "accent" : "neutral"}>
                  <span className="capitalize">{m.role}</span>
                </Badge>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Roles" />
        <dl className="divide-y divide-line text-sm">
          {Object.entries(roleText).map(([role, text]) => (
            <div key={role} className="grid grid-cols-[110px_1fr] gap-4 px-5 py-3">
              <dt className="font-medium capitalize">{role}</dt>
              <dd className="text-fg-muted">{text}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <div className="mt-6">
        <Notice>Email invitations with role selection are the next piece of this area.</Notice>
      </div>
    </>
  );
}
