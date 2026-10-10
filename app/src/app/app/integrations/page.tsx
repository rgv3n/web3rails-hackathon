import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { integrationGroups, maturityLabel, type Maturity } from "@/lib/integrations";
import { Badge, Card, CardHeader, Notice, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CreateKeyForm } from "./CreateKeyForm";
import { requestIntegration, revokeApiKey } from "./actions";

export const metadata = { title: "Integrations & API" };

const endpoints = [
  ["GET", "/v1/transactions", "Normalized onchain movements"],
  ["GET", "/v1/reconciliations", "Records with status, confidence and evidence"],
  ["POST", "/v1/matches", "Confirm or override a match"],
  ["GET", "/v1/wallets", "Known wallets and their owners"],
  ["GET", "/v1/exceptions", "Items waiting for review"],
] as const;

const maturityTone: Record<Maturity, "ok" | "accent" | "neutral"> = { available: "ok", building: "accent", planned: "neutral" };

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export default async function IntegrationsPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const [{ data: keys }, { data: requests }] = await Promise.all([
    supabase
      .from("api_keys")
      .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
      .eq("org_id", ctx.org.id)
      .order("created_at", { ascending: false }),
    supabase.from("integration_requests").select("integration_slug, status").eq("org_id", ctx.org.id),
  ]);
  const requested = new Map((requests ?? []).map((r) => [r.integration_slug, r.status]));
  const canManage = can(ctx, "manage_org");
  const canRequest = can(ctx, "import");

  return (
    <>
      <PageTitle
        title="Integrations & API"
        text="How Web3Rails connects to your systems. Status labels are product truth: nothing is listed as available unless it works today."
      />

      <section id="api" className="scroll-mt-6">
        <Card>
          <CardHeader
            title="API keys"
            text="Keys are shown once at creation. Web3Rails stores only a hash. Revoking is immediate."
            action={<Badge tone="accent">{maturityLabel.building}</Badge>}
          />
          <div className="p-5">
            <Notice>
              The REST API is in development. Keys you create now will work against it when it ships; until then they are inert. Base URL
              will be <span className="font-mono">https://api.web3rails.io</span>.
            </Notice>
            {canManage ? (
              <div className="mt-5">
                <CreateKeyForm />
              </div>
            ) : (
              <p className="mt-4 text-sm text-fg-muted">Only admins can create or revoke keys.</p>
            )}
          </div>
          <div className="border-t border-line">
            {keys && keys.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-fg-muted">
                  <tr className="border-b border-line">
                    <th className="px-5 py-2.5 font-medium">Name</th>
                    <th className="px-5 py-2.5 font-medium">Key</th>
                    <th className="px-5 py-2.5 font-medium">Scopes</th>
                    <th className="px-5 py-2.5 font-medium">Created</th>
                    <th className="px-5 py-2.5 font-medium">Last used</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {keys.map((k) => (
                    <tr key={k.id} className={k.revoked_at ? "text-fg-subtle" : ""}>
                      <td className="px-5 py-2.5 font-medium">{k.name}</td>
                      <td className="px-5 py-2.5 font-mono text-xs">{k.key_prefix}…</td>
                      <td className="px-5 py-2.5 font-mono text-xs">{k.scopes.join(", ")}</td>
                      <td className="px-5 py-2.5 text-fg-muted">{fmt(k.created_at)}</td>
                      <td className="px-5 py-2.5 text-fg-muted">{fmt(k.last_used_at)}</td>
                      <td className="px-5 py-2.5">{k.revoked_at ? <Badge>Revoked</Badge> : <Badge tone="ok">Active</Badge>}</td>
                      <td className="px-5 py-2.5 text-right">
                        {canManage && !k.revoked_at ? (
                          <form action={revokeApiKey}>
                            <input type="hidden" name="id" value={k.id} />
                            <SubmitButton variant="danger" className="h-7 px-2.5 text-xs" pendingText="Revoking…">
                              Revoke
                            </SubmitButton>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-4 text-sm text-fg-muted">No API keys yet.</p>
            )}
          </div>
        </Card>

        <Card className="mt-6">
          <CardHeader title="Endpoints" text="Read-only by design. Web3Rails never holds keys or moves funds." />
          <ul className="divide-y divide-line">
            {endpoints.map(([method, path, text]) => (
              <li key={path} className="flex items-center gap-4 px-5 py-2.5 text-sm">
                <span className="w-12 font-mono text-xs font-semibold text-accent-strong">{method}</span>
                <span className="font-mono text-xs">{path}</span>
                <span className="ml-auto text-fg-muted">{text}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-5 py-3 text-sm text-fg-muted">
            Webhooks: <span className="font-mono text-xs">transaction.detected</span>,{" "}
            <span className="font-mono text-xs">reconciliation.completed</span>,{" "}
            <span className="font-mono text-xs">reconciliation.requires_review</span> <Badge>Planned</Badge>
          </div>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Integration catalogue</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Request what your finance stack needs. Requests tell us what to build first; they do not promise a date.
        </p>
        <div className="mt-5 space-y-6">
          {integrationGroups.map((group) => (
            <Card key={group.title}>
              <CardHeader title={group.title} text={group.caption} />
              <ul className="divide-y divide-line">
                {group.items.map((item) => {
                  const status = requested.get(item.slug);
                  return (
                    <li key={item.slug} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          {item.name}
                          <Badge tone={maturityTone[item.maturity]}>{maturityLabel[item.maturity]}</Badge>
                        </p>
                        <p className="text-sm text-fg-muted">{item.text}</p>
                      </div>
                      <div className="shrink-0">
                        {status ? (
                          <Badge tone={status === "enabled" ? "ok" : "accent"}>
                            {status === "requested" ? "Requested" : status === "in_review" ? "In review" : status === "enabled" ? "Enabled" : "Declined"}
                          </Badge>
                        ) : canRequest ? (
                          <form action={requestIntegration}>
                            <input type="hidden" name="slug" value={item.slug} />
                            <SubmitButton variant="secondary" className="h-8 px-3 text-xs" pendingText="Sending…">
                              {item.maturity === "planned" ? "Request" : "Notify me"}
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
