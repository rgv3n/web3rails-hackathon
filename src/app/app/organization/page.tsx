import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { explorerAddressUrl } from "@/lib/solana";
import { Badge, Card, CardHeader, Notice, PageTitle } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { EntityForm, WalletForm } from "./forms";
import { archiveWallet } from "./actions";
import Link from "next/link";

export const metadata = { title: "Organization" };

export default async function OrganizationPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const [{ data: entities }, { data: wallets }] = await Promise.all([
    supabase.from("legal_entities").select("id, name, reporting_currency").eq("org_id", ctx.org.id).order("name"),
    supabase.from("wallets").select("id, label, address, ownership, status, entity:legal_entities(name)").eq("org_id", ctx.org.id).order("created_at"),
  ]);
  const admin = can(ctx, "manage_org");

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
                <span className="font-mono text-xs text-fg-muted">{e.reporting_currency}</span>
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
          <CardHeader title="Declared wallets" text="Public addresses only. Web3Rails never asks for private keys." />
          <ul className="divide-y divide-line">
            {(wallets ?? []).map((w) => {
              const ent = w.entity as unknown as { name: string } | null;
              const url = explorerAddressUrl("solana", w.address);
              return (
                <li key={w.id} className={`flex items-start justify-between gap-3 px-5 py-2.5 text-sm ${w.status === "archived" ? "text-fg-subtle" : ""}`}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {w.label}
                      <Badge tone={w.ownership === "verified" ? "ok" : "neutral"}>{w.ownership === "verified" ? "Verified" : "Declared"}</Badge>
                      {w.status === "archived" ? <Badge>Archived</Badge> : null}
                    </p>
                    <p className="truncate font-mono text-xs text-fg-muted">
                      {url ? <a href={url} target="_blank" rel="noreferrer" className="hover:underline">{w.address}</a> : w.address}
                    </p>
                    <p className="text-xs text-fg-subtle">{ent?.name ?? "—"} · solana</p>
                  </div>
                  {admin && w.status === "active" ? (
                    <form action={archiveWallet}>
                      <input type="hidden" name="id" value={w.id} />
                      <SubmitButton variant="ghost" className="h-7 px-2 text-xs" pendingText="…">Archive</SubmitButton>
                    </form>
                  ) : null}
                </li>
              );
            })}
            {(wallets ?? []).length === 0 ? <li className="px-5 py-4 text-sm text-fg-muted">No wallets declared.</li> : null}
          </ul>
          {admin ? (
            <div className="border-t border-line p-5">
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
