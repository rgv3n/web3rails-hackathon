import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { attestationConfigured } from "@/lib/attestation/proof";
import { Badge, Card, CardHeader, Notice, PageTitle } from "@/components/ui";
import { VerifyOwnership } from "./VerifyOwnership";

export const metadata = { title: "Verify wallet ownership" };

export default async function VerifyWalletPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await requireOrg();
  const supabase = await createClient();
  const [{ data: wallet }, { data: last }] = await Promise.all([
    supabase.from("wallets").select("id, label, address, chain, ownership, status, entity:legal_entities(name)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    supabase.from("wallet_ownership_attestations").select("id, status, trust_profile, decided_at, signer, chain, ocsp, reasons").eq("wallet_id", id).eq("status", "verified").order("decided_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!wallet) notFound();
  const ent = wallet.entity as unknown as { name: string } | null;
  const admin = can(ctx, "manage_org");
  const signer = last?.signer as { kind: string; nif: string | null; cif: string | null; organization: string | null; commonName: string | null } | null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Verify wallet ownership"
        text="The legal representative signs a statement issued by Web3Rails with a qualified certificate. Web3Rails verifies the signature, the certificate chain, revocation and identity, and keeps the signed statement as evidence."
      />
      <Card>
        <CardHeader title={wallet.label} text={`${ent?.name ?? "—"} · ${wallet.chain}`} action={<Badge tone={wallet.ownership === "verified" ? "ok" : "neutral"}>{wallet.ownership === "verified" ? "Verified" : "Declared"}</Badge>} />
        <div className="px-5 pb-4 font-mono text-xs text-fg-muted">{wallet.address}</div>
        {last && signer ? (
          <div className="border-t border-line px-5 py-4 text-sm">
            <p className="font-medium">Verified on {last.decided_at ? new Date(last.decided_at).toLocaleString("en-GB") : "—"}</p>
            <p className="text-fg-muted">
              Signed by {signer.commonName ?? "—"}
              {signer.cif ? ` on behalf of ${signer.organization ?? "—"} (${signer.cif})` : " with a personal certificate (no company identifier)"}
              {signer.nif ? ` · ${signer.nif}` : ""} · chain: {(last.chain ?? []).join(" → ")} · trust profile: {last.trust_profile}
            </p>
          </div>
        ) : null}
      </Card>
      <div className="mt-6">
        {!admin ? (
          <Notice>Only admins can verify ownership.</Notice>
        ) : wallet.status !== "active" ? (
          <Notice tone="warn">This wallet is archived.</Notice>
        ) : !attestationConfigured() ? (
          <Notice tone="warn">Ownership verification is not configured on this server (ATTESTATION_HMAC_SECRET).</Notice>
        ) : (
          <VerifyOwnership walletId={wallet.id} isDemo={ctx.org.is_demo} alreadyVerified={wallet.ownership === "verified"} />
        )}
      </div>
      <p className="mt-6 text-sm text-fg-muted">
        <Link href="/app/organization" className="font-medium text-fg hover:underline">
          Back to organization
        </Link>
      </p>
    </div>
  );
}
