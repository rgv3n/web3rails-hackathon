"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "../actions";
import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function ResetPasswordForm() {
  const [state, action] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="New password">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Repeat new password">
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      {state.error ? <Notice tone="warn">{state.error}</Notice> : null}
      <SubmitButton className="w-full" pendingText="Saving…">
        Save new password
      </SubmitButton>
    </form>
  );
}
