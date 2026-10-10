"use client";

import { useState } from "react";
import Script from "next/script";
import { Button, Card, CardHeader, Notice } from "@/components/ui";

declare global {
  interface Window {
    AutoScript?: {
      cargarAppAfirma: () => void;
      getBase64FromText: (text: string) => string;
      sign: (dataB64: string, algorithm: string, format: string, params: string, ok: (signatureB64: string, certB64: string) => void, fail: (type: string, message: string) => void) => void;
    };
  }
}

type Signer = { kind: string; nif: string | null; cif: string | null; organization: string | null; commonName: string | null; notAfter: string };
type Report = { verdict: string; reasons: string[]; signature: boolean; chain: string[] | null; anchor: string | null; ocsp: { status?: string; error?: string; skipped?: string } | null; signer: Signer | null; signingTime: string | null };
type Issued = { id: string; statement: string; trust_profile: string; expires_at: string };

export function VerifyOwnership({ walletId, isDemo, alreadyVerified }: { walletId: string; isDemo: boolean; alreadyVerified: boolean }) {
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState<"issue" | "sign" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; report: Report } | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  async function issue() {
    setBusy("issue"); setError(null); setResult(null);
    const r = await fetch("/api/attestations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_id: walletId }) });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) return setError(j.error ?? "Could not issue the statement");
    setIssued(j);
  }

  function sign() {
    if (!issued || !window.AutoScript) return setError("AutoFirma client script not loaded");
    setBusy("sign"); setError(null);
    const dataB64 = window.AutoScript.getBase64FromText(issued.statement);
    window.AutoScript.sign(dataB64, "SHA256withRSA", "CAdES", "mode=implicit\nfilters=nonexpired:", async (signatureB64) => {
      setBusy("verify");
      const r = await fetch(`/api/attestations/${issued.id}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signatureB64 }) });
      const j = await r.json();
      setBusy(null);
      if (!r.ok && !j.report) return setError(j.error ?? "Verification failed");
      setResult({ status: j.status ?? "rejected", report: j.report });
      if (r.ok && j.status === "verified") setTimeout(() => window.location.reload(), 1500);
    }, (_type, message) => { setBusy(null); setError(`AutoFirma: ${message}`); });
  }

  return (
    <div className="space-y-4">
      <Script src="/autofirma/autoscript.js" strategy="afterInteractive" onLoad={() => { window.AutoScript?.cargarAppAfirma(); setScriptReady(true); }} />
      {isDemo ? (
        <Notice tone="warn">
          Demo organization: besides FNMT certificates, this organization accepts the Web3Rails demo certificate.{" "}
          <a className="font-medium underline" href="/demo-certificate/demo-representative.p12">Download demo-representative.p12</a> (password <code>demo1234</code>, holder MARIA EJEMPLO, fictitious). Load it in AutoFirma as a PKCS#12 keystore. Real organizations reject it.
        </Notice>
      ) : null}
      <Notice>Requires the AutoFirma desktop application (firmaelectronica.gob.es) and a certificate on this computer. The statement expires 15 minutes after it is issued.</Notice>
      {alreadyVerified ? <Notice tone="ok">This wallet is already verified. Signing again adds a newer attestation.</Notice> : null}

      <Card>
        <CardHeader title="1 · Statement" text="Issued by the server for this wallet, with a nonce. These exact bytes are what you sign." action={<Button onClick={issue} variant="secondary" disabled={busy !== null}>{busy === "issue" ? "Issuing…" : issued ? "Issue a new statement" : "Issue statement"}</Button>} />
        {issued ? <pre className="mx-5 mb-5 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-xs">{JSON.stringify(JSON.parse(issued.statement), null, 2)}</pre> : null}
      </Card>
      <Card>
        <CardHeader title="2 · Sign with AutoFirma" text="AutoFirma opens, you pick the certificate, and the signature comes back here." action={<Button onClick={sign} disabled={!issued || !scriptReady || busy !== null}>{busy === "sign" ? "Waiting for AutoFirma…" : busy === "verify" ? "Verifying…" : "Sign with AutoFirma"}</Button>} />
      </Card>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {result ? (
        <Card>
          <CardHeader title={result.status === "verified" ? "3 · Ownership verified" : "3 · Rejected"} text={result.status === "verified" ? "Signature, chain, revocation and identity check out. The signed statement is stored as evidence." : "Nothing was recorded as verified. Reasons below."} />
          <div className="space-y-2 px-5 pb-5 text-sm">
            {result.report.signer ? (
              <p>
                <span className="font-medium">Signer:</span> {result.report.signer.commonName ?? "—"}
                {result.report.signer.cif ? ` · ${result.report.signer.organization ?? ""} (${result.report.signer.cif})` : " · personal certificate (no company identifier)"}
                {result.report.signer.nif ? ` · ${result.report.signer.nif}` : ""} · valid until {result.report.signer.notAfter.slice(0, 10)}
              </p>
            ) : null}
            <p><span className="font-medium">Chain:</span> {result.report.chain ? result.report.chain.join(" → ") : "not trusted"}</p>
            <p><span className="font-medium">Revocation:</span> {result.report.ocsp?.status ?? result.report.ocsp?.skipped ?? result.report.ocsp?.error ?? "not checked"}</p>
            {result.report.signingTime ? <p><span className="font-medium">Signed at:</span> {result.report.signingTime}</p> : null}
            {result.report.reasons.length ? <ul className="list-disc pl-5 text-warn">{result.report.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
