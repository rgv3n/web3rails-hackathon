import { cn } from "@/lib/cn";

const sources = ["Stablecoins", "Wallets", "Onchain payments", "Tokenized assets"];
const core: [string, string][] = [
  ["Normalize", "one record per movement"],
  ["Reconcile", "invoices · counterparties"],
  ["Control", "exceptions to review"],
  ["Audit", "evidence retained"],
];
const destinations = ["Accounting", "ERP", "Treasury", "Reporting"];

/** Four rows converge into (or diverge from) a single point. Desktop only. */
function Rails({ direction }: { direction: "in" | "out" }) {
  const ys = [26, 78, 130, 182];
  const mid = 104;
  const path = (y: number) =>
    direction === "in"
      ? `M0 ${y} C 44 ${y}, 44 ${mid}, 88 ${mid}`
      : `M0 ${mid} C 44 ${mid}, 44 ${y}, 88 ${y}`;
  return (
    <svg
      viewBox="0 0 88 208"
      className="hidden h-[208px] w-[88px] shrink-0 lg:mt-6 lg:block"
      aria-hidden
      focusable="false"
    >
      {ys.map((y) => (
        <path key={`b${y}`} d={path(y)} fill="none" stroke="var(--line-strong)" strokeWidth="1" />
      ))}
      {ys.map((y, i) => (
        <path
          key={`a${y}`}
          d={path(y)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          className="rail-anim"
          style={{ animationDelay: `${i * 0.35}s` }}
        />
      ))}
    </svg>
  );
}

function VerticalRail() {
  return (
    <div className="flex justify-center lg:hidden" aria-hidden>
      <svg viewBox="0 0 2 40" className="h-10 w-[2px]">
        <line x1="1" y1="0" x2="1" y2="40" stroke="var(--line-strong)" strokeWidth="2" />
        <line x1="1" y1="0" x2="1" y2="40" stroke="var(--accent)" strokeWidth="2" className="rail-anim" />
      </svg>
    </div>
  );
}

function StageLabel({ n, children, accent }: { n: string; children: string; accent?: boolean }) {
  return (
    <p className={cn("mb-3 flex items-baseline gap-2 font-mono text-[11px] uppercase tracking-[0.18em]", accent ? "text-accent" : "text-fg-subtle")}>
      <span className="tabular">{n}</span>
      <span>{children}</span>
    </p>
  );
}

function Column({ n, title, items }: { n: string; title: string; items: string[] }) {
  return (
    <div className="flex-1">
      <StageLabel n={n}>{title}</StageLabel>
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={it}
            className="flex h-11 items-center rounded-md border border-line bg-surface px-4 text-sm text-fg"
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InfrastructureFlow() {
  return (
    <figure aria-label="Onchain financial activity flows through Web3Rails into enterprise finance systems">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-0">
        <Column n="01" title="Onchain financial activity" items={sources} />
        <VerticalRail />
        <Rails direction="in" />

        <div className="flex-1 lg:max-w-[340px]">
          <StageLabel n="02" accent>
            Web3Rails
          </StageLabel>
          <div className="rounded-md border border-ink-line bg-ink">
            <ul className="divide-y divide-ink-line">
              {core.map(([name, hint]) => (
                <li key={name} className="flex h-[46px] items-center justify-between gap-3 px-4">
                  <span className="text-sm font-medium text-ink-fg">{name}</span>
                  <span className="truncate text-right font-mono text-[10.5px] text-ink-muted">{hint}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Rails direction="out" />
        <VerticalRail />
        <Column n="03" title="Enterprise finance" items={destinations} />
      </div>
      <figcaption className="mt-8 max-w-2xl text-pretty text-sm leading-relaxed text-fg-muted">
        A blockchain transaction proves that value moved. Web3Rails turns it into an accounting
        record: counterparty, invoice, fiat value, classification, status and evidence.
      </figcaption>
    </figure>
  );
}
