"use client";

import { useActionState, useState } from "react";
import { createWallet, type OrgAdminState } from "./actions";
import { getPhantom } from "@/lib/phantom";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

/** Declare a wallet by connecting Phantom: the address comes from the wallet, never typed. Read-only: no transaction is ever requested. */
export function ConnectPhantom({ entities }: { entities: { id: string; name: string }[] }) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, action] = useActionState<OrgAdminState, FormData>(createWallet, {});

  async function connect() {
    setError(null);
    const phantom = getPhantom();
    if (!phantom) return setError("Phantom is not installed in this browser. Install it from phantom.app or declare the address manually below.");
    try {
      const { publicKey } = await phantom.connect();
      setAddress(publicKey.toBase58());
    } catch (e) {
      setError(`Phantom: ${(e as Error).message ?? "connection refused"}`);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={connect}>{address ? "Reconnect Phantom" : "Connect Phantom"}</Button>
        {address ? <span className="font-mono text-xs text-fg-muted">{address}</span> : <span className="text-sm text-fg-muted">Reads the public address only. Web3Rails never asks for a transaction or a private key.</span>}
      </div>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {address ? (
        <form action={action} className="space-y-3 rounded-md border border-line bg-surface-2 p-4">
          <input type="hidden" name="address" value={address} />
          <input type="hidden" name="ownership_evidence" value="Connected with Phantom; control not yet proven" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Legal entity">
              <Select name="entity_id" defaultValue={entities[0]?.id ?? ""} required>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Label">
              <Input name="label" required placeholder="Treasury · Phantom" />
            </Field>
          </div>
          {state.error ? <Notice tone="warn">{state.error}</Notice> : null}
          {state.ok ? <Notice tone="ok">{state.ok} Next: open the wallet and prove control by signing with Phantom.</Notice> : null}
          <SubmitButton variant="secondary" pendingText="Declaring…">Declare this wallet</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
