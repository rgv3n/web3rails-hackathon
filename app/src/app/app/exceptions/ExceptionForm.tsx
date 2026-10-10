"use client";

import { useActionState } from "react";
import { updateException, type ExceptionState } from "./actions";
import { Input, Notice, Select } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function ExceptionForm({ id, status, assigneeId, members }: { id: string; status: string; assigneeId: string | null; members: { id: string; name: string }[] }) {
  const [state, action] = useActionState<ExceptionState, FormData>(updateException, {});
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[140px_160px_1fr_1fr_auto] sm:items-center">
      <input type="hidden" name="id" value={id} />
      <Select name="status" defaultValue={status} className="h-8 text-xs">
        <option value="open">Open</option>
        <option value="waiting">Waiting</option>
        <option value="resolved">Resolved</option>
      </Select>
      <Select name="assignee_id" defaultValue={assigneeId ?? ""} className="h-8 text-xs">
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </Select>
      <Input name="comment" placeholder="Comment (what you did or are waiting for)" className="h-8 text-xs" />
      <Input name="resolution" placeholder="Resolution (required to resolve)" className="h-8 text-xs" />
      <SubmitButton variant="secondary" className="h-8 px-3 text-xs" pendingText="Saving…">Save</SubmitButton>
      {state.error ? <div className="sm:col-span-5"><Notice tone="warn">{state.error}</Notice></div> : null}
      {state.ok ? <div className="sm:col-span-5"><Notice tone="ok">{state.ok}</Notice></div> : null}
    </form>
  );
}
