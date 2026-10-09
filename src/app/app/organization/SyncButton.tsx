"use client";

import { useActionState } from "react";
import { syncWallet, type SyncState } from "./sync";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function SyncButton({ walletId, configured }: { walletId: string; configured: boolean }) {
  const [state, action] = useActionState<SyncState, FormData>(syncWallet, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="wallet_id" value={walletId} />
      <SubmitButton variant="secondary" className="h-7 px-2 text-xs" disabled={!configured} title={configured ? "" : "HELIUS_API_KEY not set on the server"} pendingText="Syncing…">
        Sync now
      </SubmitButton>
      {state.error ? <Notice tone="warn">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="ok">{state.ok}</Notice> : null}
    </form>
  );
}
