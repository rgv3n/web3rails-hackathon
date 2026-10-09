"use client";

import { useActionState } from "react";
import { updateOrganization, updateProfile, type AccountState } from "./actions";
import { Field, Input, Notice, Select } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function ProfileForm({ fullName, jobTitle }: { fullName: string; jobTitle: string }) {
  const [state, action] = useActionState<AccountState, FormData>(updateProfile, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Full name">
        <Input name="full_name" defaultValue={fullName} required />
      </Field>
      <Field label="Job title" hint="Optional. Shown to your teammates.">
        <Input name="job_title" defaultValue={jobTitle} placeholder="Finance controller" />
      </Field>
      {state.error ? <Notice tone="warn">{state.error}</Notice> : null}
      {state.saved === "profile" ? <Notice tone="ok">Profile saved.</Notice> : null}
      <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
    </form>
  );
}

export function OrganizationForm({
  name,
  baseCurrency,
  timezone,
  readOnly,
}: {
  name: string;
  baseCurrency: string;
  timezone: string;
  readOnly: boolean;
}) {
  const [state, action] = useActionState<AccountState, FormData>(updateOrganization, {});
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={readOnly} className="space-y-4">
        <Field label="Name">
          <Input name="name" defaultValue={name} required />
        </Field>
        <Field label="Base currency">
          <Select name="base_currency" defaultValue={baseCurrency}>
            <option value="EUR">EUR — Euro</option>
            <option value="USD">USD — US Dollar</option>
          </Select>
        </Field>
        <Field label="Timezone">
          <Select name="timezone" defaultValue={timezone}>
            <option value="Europe/Madrid">Europe/Madrid</option>
            <option value="Europe/Lisbon">Europe/Lisbon</option>
            <option value="Europe/London">Europe/London</option>
            <option value="America/New_York">America/New_York</option>
            <option value="UTC">UTC</option>
          </Select>
        </Field>
      </fieldset>
      {state.error ? <Notice tone="warn">{state.error}</Notice> : null}
      {state.saved === "organization" ? <Notice tone="ok">Organization saved.</Notice> : null}
      {!readOnly ? <SubmitButton pendingText="Saving…">Save organization</SubmitButton> : null}
    </form>
  );
}
