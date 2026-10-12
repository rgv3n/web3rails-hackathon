"use client";

import { useActionState } from "react";
import { createOrganization, type OnboardingState } from "./actions";
import { Field, Input, Notice, Select } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function OnboardingForm() {
  const [state, action] = useActionState<OnboardingState, FormData>(createOrganization, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Organization name">
        <Input name="name" required placeholder="Acme Ltd." />
      </Field>
      <Field label="Tax id (CIF)" hint="Optional now; needed to verify wallet ownership with a certificate.">
        <Input name="tax_id" placeholder="B12345674" className="font-mono" />
      </Field>
      <Field label="Base currency" hint="Fiat values at settlement are expressed in this currency.">
        <Select name="base_currency" defaultValue="EUR">
          <option value="EUR">EUR — Euro</option>
          <option value="USD">USD — US Dollar</option>
        </Select>
      </Field>
      <Field label="Timezone">
        <Select name="timezone" defaultValue="Europe/Madrid">
          <option value="Europe/Madrid">Europe/Madrid</option>
          <option value="Europe/Lisbon">Europe/Lisbon</option>
          <option value="Europe/London">Europe/London</option>
          <option value="America/New_York">America/New_York</option>
          <option value="UTC">UTC</option>
        </Select>
      </Field>
      {state.error ? <Notice tone="warn">{state.error}</Notice> : null}
      <SubmitButton className="w-full" pendingText="Creating…">
        Create organization
      </SubmitButton>
    </form>
  );
}
