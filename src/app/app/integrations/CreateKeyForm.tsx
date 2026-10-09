"use client";

import { useActionState } from "react";
import { createApiKey, type KeyState } from "./actions";
import { Field, Input, Notice, Select } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";

export function CreateKeyForm() {
  const [state, action] = useActionState<KeyState, FormData>(createApiKey, {});

  if (state.secret) {
    return (
      <div className="rounded-md border border-accent-soft bg-accent-soft/40 p-4">
        <p className="text-sm font-medium">Key “{state.name}” created. Copy it now: it will not be shown again.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 overflow-x-auto rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs">{state.secret}</code>
          <CopyButton value={state.secret} label="Copy key" />
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_140px_auto_auto] sm:items-end">
      <Field label="Key name">
        <Input name="name" required placeholder="ERP connector (production)" />
      </Field>
      <Field label="Environment">
        <Select name="env" defaultValue="test">
          <option value="test">Test</option>
          <option value="live">Live</option>
        </Select>
      </Field>
      <fieldset className="flex items-center gap-4 pb-2 text-sm">
        <legend className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-fg-muted">Scopes</legend>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" name="scopes" value="read" defaultChecked className="accent-[var(--accent-strong)]" /> read
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" name="scopes" value="write" className="accent-[var(--accent-strong)]" /> write
        </label>
      </fieldset>
      <SubmitButton pendingText="Creating…">Create key</SubmitButton>
      {state.error ? (
        <div className="sm:col-span-4">
          <Notice tone="warn">{state.error}</Notice>
        </div>
      ) : null}
    </form>
  );
}
