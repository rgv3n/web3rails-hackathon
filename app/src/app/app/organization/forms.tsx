"use client";

import { useActionState } from "react";
import { createEntity, createWallet, type OrgAdminState } from "./actions";
import { Field, Input, Notice, Select } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function EntityForm() {
  const [state, action] = useActionState<OrgAdminState, FormData>(createEntity, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_150px_150px_120px_auto] sm:items-end">
      <Field label="New entity">
        <Input name="name" required placeholder="Acme Ltd. (UK)" />
      </Field>
      <Field label="Tax id (CIF/NIF)" hint="Compared with the signer's certificate.">
        <Input name="tax_id" placeholder="B12345674" className="font-mono" />
      </Field>
      <Field label="Type">
        <Select name="subject_type" defaultValue="legal_entity">
          <option value="legal_entity">Company</option>
          <option value="natural_person">Natural person</option>
        </Select>
      </Field>
      <Field label="Reporting">
        <Select name="reporting_currency" defaultValue="EUR">
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
        </Select>
      </Field>
      <SubmitButton variant="secondary" pendingText="Adding…">Add entity</SubmitButton>
      {state.error ? <div className="sm:col-span-5"><Notice tone="warn">{state.error}</Notice></div> : null}
      {state.ok ? <div className="sm:col-span-5"><Notice tone="ok">{state.ok}</Notice></div> : null}
    </form>
  );
}

export function WalletForm({ entities }: { entities: { id: string; name: string }[] }) {
  const [state, action] = useActionState<OrgAdminState, FormData>(createWallet, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Legal entity">
          <Select name="entity_id" defaultValue={entities[0]?.id ?? ""} required>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Label">
          <Input name="label" required placeholder="Operations · Solana" />
        </Field>
      </div>
      <Field label="Solana address" hint="Public address, base58.">
        <Input name="address" required className="font-mono" placeholder="9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" />
      </Field>
      <Field label="Ownership evidence" hint="Optional: how you know this wallet is yours (custodian statement, signed message, internal record).">
        <Input name="ownership_evidence" placeholder="Fireblocks vault 12 · statement 2026-09" />
      </Field>
      {state.error ? <Notice tone="warn">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="ok">{state.ok}</Notice> : null}
      <SubmitButton variant="secondary" pendingText="Declaring…">Declare wallet</SubmitButton>
    </form>
  );
}
