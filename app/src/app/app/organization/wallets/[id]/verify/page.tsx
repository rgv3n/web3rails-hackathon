import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { attestationConfigured } from "@/lib/attestation/proof";
import { Badge, Card, CardHeader, Notice, PageTitle } from "@/components/ui";
import { VerifyOwnership } from "./VerifyOwnership";
import { ProveControl } from "./ProveControl";

export const metadata = { title: "Verify wallet ownership" };

export default async function VerifyWalletPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await requireOrg();
  const supabase = await createClient();
  const [{ data: wallet }, { data: last }] = await Promise.all([
    supabase.from("wallets").select("id, label, address, chain, ownership, status, control_verified_at, entity:legal_entities(name, tax_id, subject_type)").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    supabase.from("wallet_ownership_attestations").select("id, status, trust_profile, decided_at, signer, chain, ocsp, reasons").eq("wallet_id", id).eq("status", "verified").eq("method", "certificate").order("decided_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data: lastKey } = await supabase.from("wallet_ownership_attestations").select("id, decided_at, linked_attestation_id").eq("wallet_id", id).eq("status", "verified").eq("method", "wallet_key").order("decided_at", { ascending: false }).limit(1).maybeSingle();
  if (!wallet) notFound();
  const ent = wallet.entity as unknown as { name: string; tax_id: string | null; subject_type: string } | null;
  const admin = can(ctx, "manage_org");
  const signer = last?.signer as { kind: string; nif: string | null; cif: string | null; organization: string | null; commonName: string | null } | null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Verify wallet ownership"
        text="Two independent proofs. Legal identity: the representative signs a statement issued by Web3Rails with a qualified certificate. Control: the wallet's own key signs a statement through Phantom. Each one is verified on the server and kept as evidence."
      />
      <Card>
        <CardHeader title={wallet.label} text={`${ent?.name ?? "—"}${ent?.tax_id ? ` · tax id ${ent.tax_id}` : " · no tax id set"} · ${wallet.chain}`} action={<span className="flex gap-2"><Badge tone={wallet.ownership === "verified" ? "ok" : "neutral"}>{wallet.ownership === "verified" ? "Identity verified" : "Declared"}</Badge><Badge tone={wallet.control_verified_at ? "ok" : "neutral"}>{wallet.control_verified_at ? "Control proven" : "Control not proven"}</Badge></span>} />
        <div className="px-5 pb-4 font-mono text-xs text-fg-muted">{wallet.address}</div>
        {last && signer ? (
          <div className="border-t border-line px-5 py-4 text-sm">
            <p className="font-medium">Verified on {last.decided_at ? new Date(last.decided_at).toLocaleString("en-GB") : "—"}</p>
            <p className="text-fg-muted">
              Signed by {signer.commonName ?? "—"}
              {signer.cif ? ` on behalf of ${signer.organization ?? "—"} (${signer.cif})` : " with a personal certificate (no company identifier)"}
              {signer.nif ? ` · ${signer.nif}` : ""} · chain: {(last.chain ?? []).join(" → ")} · trust profile: {last.trust_profile}
            </p>
            {lastKey ? (
              <p className="mt-1 text-fg-muted">
                Control proven on {lastKey.decided_at ? new Date(lastKey.decided_at).toLocaleString("en-GB") : "—"}
                {lastKey.linked_attestation_id === last.id ? " · linked to this certificate signature" : " · not linked to the certificate signature (sign again to link)"}
              </p>
            ) : null}
          </div>
        ) : null}
        {!ent?.tax_id && admin ? <div className="border-t border-line px-5 py-3"><Notice tone="warn">This entity has no tax id. Set it in Organization: the certificate must represent that tax id.</Notice></div> : null}
      </Card>
      <div className="mt-6">
        {!admin ? (
          <Notice>Only admins can verify ownership.</Notice>
        ) : wallet.status !== "active" ? (
          <Notice tone="warn">This wallet is archived.</Notice>
        ) : !attestationConfigured() ? (
          <Notice tone="warn">Ownership verification is not configured on this server (ATTESTATION_HMAC_SECRET).</Notice>
        ) : (
          <div className="space-y-6">
            <ProveControl walletId={wallet.id} address={wallet.address} alreadyProven={Boolean(wallet.control_verified_at)} certificateAttestationId={last?.id ?? null} />
            <VerifyOwnership walletId={wallet.id} isDemo={ctx.org.is_demo} alreadyVerified={wallet.ownership === "verified"} />
          </div>
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
