import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Card, PageTitle } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("audit_events")
    .select("id, entity, action, after, before, at, actor:profiles!audit_events_actor_profile_fkey(full_name)")
    .eq("org_id", ctx.org.id)
    .order("at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageTitle title="Audit log" text="Insert-only. Every change in this organization, with who did it and when." />
      <Card>
        {events && events.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-fg-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 font-medium">When</th>
                <th className="px-5 py-2.5 font-medium">Who</th>
                <th className="px-5 py-2.5 font-medium">What</th>
                <th className="px-5 py-2.5 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((e) => {
                const actor = e.actor as unknown as { full_name: string | null } | null;
                return (
                  <tr key={e.id}>
                    <td className="tabular whitespace-nowrap px-5 py-2.5 font-mono text-xs text-fg-muted">
                      {new Date(e.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-5 py-2.5">{actor?.full_name ?? "system"}</td>
                    <td className="px-5 py-2.5">
                      <span className="font-medium">{e.entity}</span> <span className="text-fg-muted">{e.action}</span>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-fg-muted">{JSON.stringify(e.after ?? e.before ?? {})}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-4 text-sm text-fg-muted">No events yet.</p>
        )}
      </Card>
    </>
  );
}
