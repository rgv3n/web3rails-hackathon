"use client";

import { useActionState } from "react";
import { updateMatchingSettings, updateOrganization, updateProfile, type AccountState } from "./actions";
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

export function MatchingSettingsForm({ tolerance, windowDays, allowSelfApproval, readOnly }: { tolerance: string; windowDays: number; allowSelfApproval: boolean; readOnly: boolean }) {
  const [state, action] = useActionState<AccountState, FormData>(updateMatchingSettings, {});
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={readOnly} className="space-y-4">
        <Field label="Amount tolerance" hint="Absolute difference allowed between invoice and movement, in token units. Shown on every proposal. Initial value 0.01 (decision of 9 Oct 2026).">
          <Input name="matching_tolerance" defaultValue={tolerance} className="font-mono" />
        </Field>
        <Field label="Date window (days after due date)" hint="A movement later than this is still a candidate by amount, but loses the date signal.">
          <Input name="matching_date_window_days" type="number" min={0} defaultValue={windowDays} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="allow_self_approval" defaultChecked={allowSelfApproval} className="mt-1 accent-[var(--accent-strong)]" />
          <span>
            Allow self-approval
            <span className="block text-xs text-fg-subtle">Default off: the person who made the material decision cannot approve it. Turn on only for single-person teams; the change is audited.</span>
          </span>
        </label>
      </fieldset>
      {state.error ? <Notice tone="warn">{state.error}</Notice> : null}
      {state.saved === "matching" ? <Notice tone="ok">Matching settings saved. Matching re-ran for open movements.</Notice> : null}
      {!readOnly ? <SubmitButton pendingText="Saving…">Save matching settings</SubmitButton> : null}
    </form>
  );
}
