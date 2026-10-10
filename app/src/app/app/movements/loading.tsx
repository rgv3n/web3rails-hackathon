export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading movements">
      <div className="h-8 w-48 rounded bg-surface-2" />
      <div className="h-10 w-full rounded bg-surface-2" />
      <div className="h-64 w-full rounded-lg border border-line bg-surface" />
    </div>
  );
}
