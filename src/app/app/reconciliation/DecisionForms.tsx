"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { acceptMatch, manualLink, rejectMatch, unlinkMatch, type DecisionState } from "./actions";
import { Button, Input, Notice, Select } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

function Status({ state }: { state: DecisionState }) {
  const router = useRouter();
  if (state.conflict)
    return (
      <Notice tone="warn">
        {state.error} <Button type="button" variant="secondary" className="ml-2 h-7 px-2 text-xs" onClick={() => router.refresh()}>Reload</Button>
      </Notice>
    );
  if (state.error) return <Notice tone="warn">{state.error}</Notice>;
  if (state.ok) return <Notice tone="ok">{state.ok}</Notice>;
  return null;
}

export function AcceptRejectForm({ movementId, invoiceId, version }: { movementId: string; invoiceId: string; version: number }) {
  const [acc, acceptAction] = useActionState<DecisionState, FormData>(acceptMatch, {});
  const [rej, rejectAction] = useActionState<DecisionState, FormData>(rejectMatch, {});
  return (
    <div className="space-y-2">
      <form action={acceptAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="movement_id" value={movementId} />
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <input type="hidden" name="expected_version" value={version} />
        <Input name="reason" placeholder="Reason (optional)" className="h-8 w-56 text-xs" />
        <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
          <input type="checkbox" name="learn_address" className="accent-[var(--accent-strong)]" /> remember this address for the counterparty
        </label>
        <SubmitButton className="h-8 px-3 text-xs" pendingText="Accepting…">Accept match</SubmitButton>
      </form>
      <form action={rejectAction} className="flex items-center gap-2">
        <input type="hidden" name="movement_id" value={movementId} />
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <input type="hidden" name="expected_version" value={version} />
        <Input name="reason" placeholder="Why it is not this invoice" className="h-8 w-56 text-xs" required />
        <SubmitButton variant="danger" className="h-8 px-3 text-xs" pendingText="Rejecting…">Reject</SubmitButton>
      </form>
      <Status state={acc} />
      <Status state={rej} />
    </div>
  );
}

export function ManualLinkForm({ movementId, version, invoices }: { movementId: string; version: number; invoices: { id: string; external_ref: string; counterparty_name: string; amount: string; currency: string }[] }) {
  const [state, action] = useActionState<DecisionState, FormData>(manualLink, {});
  if (invoices.length === 0) return <p className="text-xs text-fg-subtle">No open invoice in this token, entity and direction to link manually.</p>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="movement_id" value={movementId} />
      <input type="hidden" name="expected_version" value={version} />
      <div className="flex flex-wrap items-center gap-2">
        <Select name="invoice_id" className="h-8 w-auto max-w-xs text-xs" required>
          <option value="">Link to an open invoice…</option>
          {invoices.map((i) => (
            <option key={i.id} value={i.id}>{i.external_ref} · {i.counterparty_name} · {i.amount} {i.currency}</option>
          ))}
        </Select>
        <Input name="reason" placeholder="Reason (required for a manual link)" className="h-8 w-64 text-xs" required />
        <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
          <input type="checkbox" name="learn_address" className="accent-[var(--accent-strong)]" /> remember address
        </label>
        <SubmitButton variant="secondary" className="h-8 px-3 text-xs" pendingText="Linking…">Link manually</SubmitButton>
      </div>
      <Status state={state} />
    </form>
  );
}

export function UnlinkForm({ movementId, version }: { movementId: string; version: number }) {
  const [state, action] = useActionState<DecisionState, FormData>(unlinkMatch, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="movement_id" value={movementId} />
      <input type="hidden" name="expected_version" value={version} />
      <div className="flex items-center gap-2">
        <Input name="reason" placeholder="Why this link is wrong (required)" className="h-8 w-64 text-xs" required />
        <SubmitButton variant="danger" className="h-8 px-3 text-xs" pendingText="Unlinking…">Unlink</SubmitButton>
      </div>
      <Status state={state} />
    </form>
  );
}
