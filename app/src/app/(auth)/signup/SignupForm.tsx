"use client";

import { useActionState } from "react";
import { signUp, type AuthState } from "../actions";
import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function SignupForm() {
  const [state, action] = useActionState<AuthState, FormData>(signUp, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Full name">
        <Input name="full_name" autoComplete="name" required placeholder="Ada Lovelace" />
      </Field>
      <Field label="Work email">
        <Input name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
      </Field>
      <Field label="Password" hint="At least 8 characters.">
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      {state.error ? <Notice tone="warn">{state.error}</Notice> : null}
      {state.message ? <Notice tone="ok">{state.message}</Notice> : null}
      <SubmitButton className="w-full" pendingText="Creating…">
        Create account
      </SubmitButton>
    </form>
  );
}
