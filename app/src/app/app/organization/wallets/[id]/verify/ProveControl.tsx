"use client";

import { useState } from "react";
import { getPhantom, bytesToBase64 } from "@/lib/phantom";
import { Button, Card, CardHeader, Notice } from "@/components/ui";

/** The wallet's own key signs the issued statement (Phantom signMessage): proof of control, not of legal identity. */
export function ProveControl({ walletId, address, alreadyProven, certificateAttestationId }: { walletId: string; address: string; alreadyProven: boolean; certificateAttestationId: string | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run() {
    setError(null); setDone(null);
    const phantom = getPhantom();
    if (!phantom) return setError("Phantom is not installed in this browser.");
    try {
      setBusy("Connecting…");
      const { publicKey } = await phantom.connect();
      if (publicKey.toBase58() !== address) return setError(`Phantom is connected to ${publicKey.toBase58()}, not to this wallet. Switch accounts in Phantom and try again.`);
      setBusy("Issuing statement…");
      let r = await fetch("/api/attestations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_id: walletId, method: "wallet_key", link: certificateAttestationId }) });
      const issued = await r.json();
      if (!r.ok) return setError(issued.error ?? "Could not issue the statement");
      setBusy("Waiting for Phantom…");
      const { signature } = await phantom.signMessage(new TextEncoder().encode(issued.statement), "utf8");
      setBusy("Verifying…");
      r = await fetch(`/api/attestations/${issued.id}/verify-wallet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signatureB64: bytesToBase64(signature) }) });
      const v = await r.json();
      if (!r.ok && !v.report) return setError(v.error ?? "Verification failed");
      if (v.status === "verified") { setDone("Control proven: the wallet key signed the statement. Stored as evidence."); setTimeout(() => window.location.reload(), 1500); }
      else setError(`Rejected: ${(v.report?.reasons ?? [v.error]).join("; ")}`);
    } catch (e) {
      setError(`Phantom: ${(e as Error).message ?? "cancelled"}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Prove control with the wallet key"
        text={certificateAttestationId ? "Phantom signs a statement that carries the hash of the certificate signature already verified: the key accepts exactly what the representative signed. Both proofs become one." : "Phantom signs the statement with the wallet's own key. Proves who holds the key. Verify identity with the certificate first and the two proofs get linked."}
        action={<Button type="button" variant="secondary" onClick={run} disabled={busy !== null}>{busy ?? (alreadyProven ? "Sign again" : "Sign with Phantom")}</Button>}
      />
      <div className="space-y-2 px-5 pb-5">
        {alreadyProven ? <Notice tone="ok">Control already proven for this wallet.</Notice> : null}
        {certificateAttestationId ? <Notice>Will be linked to certificate attestation <code>{certificateAttestationId.slice(0, 8)}…</code>.</Notice> : null}
        {error ? <Notice tone="warn">{error}</Notice> : null}
        {done ? <Notice tone="ok">{done}</Notice> : null}
      </div>
    </Card>
  );
}
