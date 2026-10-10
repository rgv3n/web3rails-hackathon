"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "../actions";
import { Field, Input, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

const NOTICES: Record<string, string> = {
  "link-expired": "That link has expired or was already used. Request a new one.",
};

export function LoginForm({ next, notice }: { next: string; notice: string | null }) {
  const [state, action] = useActionState<AuthState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error ? <Notice tone="warn">{state.error}</Notice> : notice && NOTICES[notice] ? <Notice tone="warn">{NOTICES[notice]}</Notice> : null}
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
      <p className="text-center text-sm text-fg-muted">
        <Link href="/forgot-password" className="underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
