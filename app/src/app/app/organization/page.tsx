import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { explorerAddressUrl } from "@/lib/solana";
import { Badge, Card, CardHeader, Notice, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { EntityForm, WalletForm } from "./forms";
import { archiveWallet } from "./actions";
import { SyncButton } from "./SyncButton";
import { ConnectPhantom } from "./ConnectPhantom";
import { heliusConfigured } from "@/lib/helius";
import Link from "next/link";

export const metadata = { title: "Organization" };

export default async function OrganizationPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const [{ data: entities }, { data: wallets }] = await Promise.all([
    supabase.from("legal_entities").select("id, name, reporting_currency, tax_id, subject_type").eq("org_id", ctx.org.id).order("name"),
    supabase.from("wallets").select("id, label, address, ownership, status, control_verified_at, last_synced_at, last_sync_error, sync_cursor, entity:legal_entities(name)").eq("org_id", ctx.org.id).order("created_at"),
  ]);
  const admin = can(ctx, "manage_org");
  const configured = heliusConfigured();
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.org.timezone }) : "never");

  return (
    <>
      <PageTitle
        title="Organization"
        text={`${ctx.org.name} · legal entities and declared wallets. Members are under Team; organization settings under Account.`}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Legal entities" text="Each movement and invoice belongs to one entity with its reporting currency." />
          <ul className="divide-y divide-line">
            {(entities ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span>{e.name}</span>
                <span className="font-mono text-xs text-fg-muted">{e.tax_id ? `${e.tax_id} · ` : "no tax id · "}{e.subject_type === "natural_person" ? "person · " : ""}{e.reporting_currency}</span>
              </li>
            ))}
          </ul>
          {admin ? (
            <div className="border-t border-line p-5">
              <EntityForm />
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Declared wallets" text="Public addresses only. Web3Rails never asks for private keys." action={<Badge tone={configured ? "ok" : "neutral"}>{configured ? "Chain sync: Helius" : "Chain sync: not configured"}</Badge>} />
          <ul className="divide-y divide-line">
            {(wallets ?? []).map((w) => {
              const ent = w.entity as unknown as { name: string } | null;
              const url = explorerAddressUrl("solana", w.address);
              return (
                <li key={w.id} className={`flex items-start justify-between gap-3 px-5 py-2.5 text-sm ${w.status === "archived" ? "text-fg-subtle" : ""}`}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {w.label}
                      <Badge tone={w.ownership === "verified" ? "ok" : "neutral"}>{w.ownership === "verified" ? "Identity verified" : "Declared"}</Badge>
                      {w.control_verified_at ? <Badge tone="ok">Control proven</Badge> : null}
                      {w.status === "archived" ? <Badge>Archived</Badge> : null}
                    </p>
                    <p className="truncate font-mono text-xs text-fg-muted">
                      {url ? <a href={url} target="_blank" rel="noreferrer" className="hover:underline">{w.address}</a> : w.address}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {ent?.name ?? "—"} · solana · last sync {fmt(w.last_synced_at)}
                      {w.last_sync_error ? <span className="text-warn"> · {w.last_sync_error}</span> : null}
                    </p>
                  </div>
                  {w.status === "active" ? (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {can(ctx, "import") ? <SyncButton walletId={w.id} configured={configured} /> : null}
                      {admin ? (
                        <Link href={`/app/organization/wallets/${w.id}/verify`} className="text-xs font-medium text-fg hover:underline">
                          {w.ownership === "verified" || w.control_verified_at ? "Ownership evidence" : "Verify ownership"}
                        </Link>
                      ) : null}
                      {admin ? (
                        <form action={archiveWallet}>
                          <input type="hidden" name="id" value={w.id} />
                          <SubmitButton variant="ghost" className="h-7 px-2 text-xs" pendingText="…">Archive</SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
            {(wallets ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-fg-muted">No wallets declared.</li> : null}
          </ul>
          {admin ? (
            <div className="space-y-5 border-t border-line p-5">
              <ConnectPhantom entities={entities ?? []} />
              <p className="text-xs uppercase tracking-wide text-fg-subtle">or declare an address manually</p>
              <WalletForm entities={entities ?? []} />
            </div>
          ) : (
            <div className="border-t border-line p-5"><Notice>Only admins can declare wallets.</Notice></div>
          )}
        </Card>
      </div>
      <p className="mt-6 text-sm text-fg-muted">
        Members and roles: <Link href="/app/team" className="font-medium text-fg hover:underline">Team</Link>. Base currency and timezone:{" "}
        <Link href="/app/account" className="font-medium text-fg hover:underline">Account</Link>.
      </p>
    </>
  );
}
