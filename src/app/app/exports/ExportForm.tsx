"use client";

import { useActionState } from "react";
import { createExport, type ExportState } from "./actions";
import { Field, Input, Notice, Select } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function ExportForm({ entities, defaultFrom, defaultTo }: { entities: { id: string; name: string }[]; defaultFrom: string; defaultTo: string }) {
  const [state, action] = useActionState<ExportState, FormData>(createExport, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <Field label="From"><Input name="from" type="date" defaultValue={defaultFrom} required /></Field>
      <Field label="To"><Input name="to" type="date" defaultValue={defaultTo} required /></Field>
      <Field label="Entity">
        <Select name="entity_id" defaultValue="">
          <option value="">All entities</option>
          {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
      </Field>
      <SubmitButton pendingText="Creating…">Create export</SubmitButton>
      {state.error ? <div className="sm:col-span-4"><Notice tone="warn">{state.error}</Notice></div> : null}
      {state.ok ? <div className="sm:col-span-4"><Notice tone="ok">{state.ok} {state.id ? <a className="underline" href={`/app/exports/${state.id}/download`}>Download CSV</a> : null}</Notice></div> : null}
    </form>
  );
}
