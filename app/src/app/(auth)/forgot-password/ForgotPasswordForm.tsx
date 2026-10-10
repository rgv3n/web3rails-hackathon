"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "../actions";
import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function ForgotPasswordForm() {
  const [state, action] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  if (state.message) return <Notice tone="ok">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
      </Field>
      {state.error ? <Notice tone="warn">{state.error}</Notice> : null}
      <SubmitButton className="w-full" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}
