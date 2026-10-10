"use client";

import { Button, Notice } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-3">
      <Notice tone="warn">
        Something failed while loading this page. {error.digest ? <span className="font-mono text-xs">ref {error.digest}</span> : null}
      </Notice>
      <Button variant="secondary" onClick={() => reset()}>Try again</Button>
    </div>
  );
}
