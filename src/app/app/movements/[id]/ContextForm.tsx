"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveContext, type ContextState } from "./actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { categoryLabel } from "../queries";

interface Initial {
  counterparty_name: string;
  purpose: string;
  category: string;
  reference: string;
  note: string;
}

export function ContextForm({ movementId, version, initial, approved }: { movementId: string; version: number; initial: Initial; approved: boolean }) {
  const [state, action] = useActionState<ContextState, FormData>(saveContext, {});
  const router = useRouter();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="movement_id" value={movementId} />
      <input type="hidden" name="expected_version" value={version} />
      {approved ? <Notice tone="warn">This record is approved. Saving a material change sends it back to review and keeps the history.</Notice> : null}
      <Fields key={version} initial={initial} />
      {state.conflict ? (
        <Notice tone="warn">
          {state.error}{" "}
          <Button type="button" variant="secondary" className="ml-2 h-7 px-2 text-xs" onClick={() => router.refresh()}>
            Reload
          </Button>
        </Notice>
      ) : state.error ? (
        <Notice tone="warn">{state.error}</Notice>
      ) : null}
      {state.savedVersion ? <Notice tone="ok">Saved as revision {state.savedVersion}.</Notice> : null}
      <SubmitButton pendingText="Saving…">Save revision {version + 1}</SubmitButton>
    </form>
  );
}

/** Keyed by version so a fresh server revision resets the inputs after a save, while the form status above survives. */
function Fields({ initial }: { initial: Initial }) {
  return (
    <>
      <Field label="Category">
        <Select name="category" defaultValue={initial.category}>
          {Object.entries(categoryLabel).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </Field>
      <Field label="Counterparty" hint="Legal name as it appears on invoices. A wallet address alone is not an identity.">
        <Input name="counterparty_name" defaultValue={initial.counterparty_name} placeholder="Acme Ltd." />
      </Field>
      <Field label="Purpose">
        <Input name="purpose" defaultValue={initial.purpose} placeholder="September subscription" />
      </Field>
      <Field label="Reference" hint="Invoice number, PO or memo.">
        <Input name="reference" defaultValue={initial.reference} placeholder="INV-291" />
      </Field>
      <Field label="Note">
        <Input name="note" defaultValue={initial.note} />
      </Field>
      <Field label="Reason for this change" hint="Recorded in the audit log.">
        <Input name="reason" placeholder="Matched to supplier statement" />
      </Field>
    </>
  );
}
