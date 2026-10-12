"use client";

import { useActionState } from "react";
import { anchorExport, type AnchorState } from "./actions";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function AnchorButton({ exportId, configured }: { exportId: string; configured: boolean }) {
  const [state, action] = useActionState<AnchorState, FormData>(anchorExport, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={exportId} />
      <SubmitButton variant="secondary" className="h-7 px-2 text-xs" disabled={!configured} title={configured ? "" : "SOLANA_ANCHOR_SECRET_KEY not set on the server"} pendingText="Anchoring…">
        Anchor on Solana
      </SubmitButton>
      {state.error ? <Notice tone="warn">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="ok">{state.ok}</Notice> : null}
    </form>
  );
}
