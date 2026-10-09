"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { approveMovement, returnMovement, type ReviewState } from "./actions";
import { Button, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

function Status({ state }: { state: ReviewState }) {
  const router = useRouter();
  if (state.conflict) return <Notice tone="warn">{state.error} <Button type="button" variant="secondary" className="ml-2 h-7 px-2 text-xs" onClick={() => router.refresh()}>Reload</Button></Notice>;
  if (state.error) return <Notice tone="warn">{state.error}</Notice>;
  if (state.ok) return <Notice tone="ok">{state.ok}</Notice>;
  return null;
}

export function ReviewForms({ movementId, version, eligible, canReturn }: { movementId: string; version: number; eligible: boolean; canReturn: boolean }) {
  const [a, approve] = useActionState<ReviewState, FormData>(approveMovement, {});
  const [r, ret] = useActionState<ReviewState, FormData>(returnMovement, {});
  return (
    <div className="space-y-3">
      <form action={approve} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="movement_id" value={movementId} />
        <input type="hidden" name="expected_version" value={version} />
        <Input name="reason" placeholder="Note (optional)" className="h-8 w-56 text-xs" />
        <SubmitButton className="h-8 px-3 text-xs" disabled={!eligible} pendingText="Approving…" title={eligible ? "" : "Resolve the blockers listed above first"}>
          Approve
        </SubmitButton>
        {!eligible ? <span className="text-xs text-fg-subtle">Disabled: see blockers above. The server re-checks on submit.</span> : null}
      </form>
      {canReturn ? (
        <form action={ret} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="movement_id" value={movementId} />
          <input type="hidden" name="expected_version" value={version} />
          <Input name="reason" placeholder="What must be corrected (required)" className="h-8 w-72 text-xs" required />
          <SubmitButton variant="danger" className="h-8 px-3 text-xs" pendingText="Returning…">Return for correction</SubmitButton>
        </form>
      ) : null}
      <Status state={a} />
      <Status state={r} />
    </div>
  );
}
