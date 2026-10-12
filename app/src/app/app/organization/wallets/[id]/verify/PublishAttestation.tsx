"use client";

import { useActionState } from "react";
import { Badge, Card, CardHeader, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { closeSas, publishSas, setSasOptIn, type SasState } from "./actions";

export interface LiveSas { id: string; attestation_pda: string; signature: string; cluster: string; fields: Record<string, string>; published_at: string; expiry: string | null }

export function PublishAttestation(props: {
  walletId: string;
  optIn: boolean;
  configured: boolean;
  cluster: string;
  certificateAttestationId: string | null;
  live: LiveSas | null;
  explorerUrl: string | null;
}) {
  const [optState, optAction] = useActionState<SasState, FormData>(setSasOptIn, {});
  const [pubState, pubAction] = useActionState<SasState, FormData>(publishSas, {});
  const [closeState, closeAction] = useActionState<SasState, FormData>(closeSas, {});
  const canPublish = props.optIn && Boolean(props.certificateAttestationId) && !props.live;
  return (
    <Card>
      <CardHeader
        title="Public attestation on Solana (opt-in)"
        text="Off by default. If you opt in, Web3Rails writes a Solana Attestation Service record that says this wallet's ownership was verified with a qualified certificate. It carries five fields: wallet, subject type, level, the certificate provider and the hash of the signed statement. No name, no tax id, nothing derived from them. You can close it at any time."
        action={<Badge tone={props.live ? "ok" : "neutral"}>{props.live ? "Published" : props.optIn ? "Opted in" : "Not published"}</Badge>}
      />
      <div className="space-y-4 px-5 pb-5 text-sm">
        {!props.configured ? <Notice tone="warn">Public attestations are not enabled on this server (SOLANA_ANCHOR_SECRET_KEY, devnet).</Notice> : null}
        <form action={optAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="wallet_id" value={props.walletId} />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="opt_in" defaultChecked={props.optIn} className="accent-fg" />
            Allow a public attestation for this wallet
          </label>
          <SubmitButton variant="secondary" className="h-8 px-3 text-xs" pendingText="Saving…">
            Save
          </SubmitButton>
          {optState.error ? <Notice tone="warn">{optState.error}</Notice> : null}
          {optState.ok ? <Notice tone="ok">{optState.ok}</Notice> : null}
        </form>
        {props.live ? (
          <div className="rounded-md border border-line p-3">
            <p className="font-medium">
              On-chain since {new Date(props.live.published_at).toLocaleString("en-GB")} · {props.live.cluster}
              {props.live.expiry ? ` · valid until ${new Date(props.live.expiry).toLocaleDateString("en-GB")}` : ""}
            </p>
            <p className="mt-1 font-mono text-xs text-fg-muted">
              {props.explorerUrl ? (
                <a href={props.explorerUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  {props.live.attestation_pda}
                </a>
              ) : (
                props.live.attestation_pda
              )}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {Object.entries(props.live.fields).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd className="break-all font-mono">{v}</dd>
                </div>
              ))}
            </dl>
            <form action={closeAction} className="mt-3 flex flex-col items-start gap-2">
              <input type="hidden" name="sas_id" value={props.live.id} />
              <SubmitButton variant="secondary" className="h-8 px-3 text-xs" disabled={!props.configured} pendingText="Closing…">
                Close attestation
              </SubmitButton>
              {closeState.error ? <Notice tone="warn">{closeState.error}</Notice> : null}
              {closeState.ok ? <Notice tone="ok">{closeState.ok}</Notice> : null}
            </form>
          </div>
        ) : (
          <form action={pubAction} className="flex flex-col items-start gap-2">
            <input type="hidden" name="attestation_id" value={props.certificateAttestationId ?? ""} />
            <SubmitButton
              disabled={!canPublish || !props.configured}
              title={!props.certificateAttestationId ? "Verify ownership with a certificate first" : !props.optIn ? "Opt in first" : ""}
              pendingText="Publishing…"
            >
              Publish attestation
            </SubmitButton>
            <p className="text-xs text-fg-muted">Nonce = the wallet address. Expiry = the certificate&apos;s expiry. Issuer key: the Web3Rails anchor key on {props.cluster}.</p>
            {pubState.error ? <Notice tone="warn">{pubState.error}</Notice> : null}
            {pubState.ok ? <Notice tone="ok">{pubState.ok}</Notice> : null}
          </form>
        )}
      </div>
    </Card>
  );
}
