# Web3Rails — front office (app.web3rails.io)

B2B workspace where a finance team turns Solana stablecoin movements into identified, reconciled, reviewed and exportable records with evidence.
Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Auth + Postgres + RLS) · lucide-react · Vitest.

Specification: `docs/front-office-implementation.md`. Plan and status: `docs/front-office-plan.md`. Verification log: `docs/front-office-verification.md`. Contract with engine/backoffice: `../docs/2026-10-09-contrato-backoffice.md`.

## Run

```bash
npm install
npx supabase start        # local stack on ports 573xx (API 57321, DB 57322, Studio 57323, mail 57324); applies supabase/migrations
cp .env.example .env.local  # local keys are printed by `supabase start`
npm run dev               # http://localhost:3000
npm test                  # 50+ rule tests against the local stack (creates and deletes its own users/orgs)
npm run build && npm run lint
```

No `psql` on the host: `docker exec supabase_db_web3rails-app psql -U postgres -d postgres`.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase project (local or hosted) |
| `HELIUS_API_KEY` | no | Read-only wallet sync. Without it the UI shows “Chain sync: not configured” and CSV import is the only source. Server-side only. |

No valuation source is configured yet: fiat values show as “No valuation”, never 0.

## Main routes

| Route | What |
|---|---|
| `/login`, `/signup`, `/onboarding` | Account and organization |
| `/app` | Overview: counts, sync status, valuation coverage, path to first export |
| `/app/movements`, `/app/movements/[id]`, `/app/movements/import` | Work tray with server-side filters/pagination; detail with 4 blocks + review; CSV import with preview |
| `/app/reconciliation` | Open proposals with named signals; accept / reject / manual link |
| `/app/exceptions` | Queue: reason, owner, waiting, resolution |
| `/app/invoices`, `/app/invoices/import` | Invoices (1:1 link) and CSV import |
| `/app/exports`, `/app/exports/[id]/download` | Snapshot exports (CSV schema v1, SHA-256) |
| `/app/organization`, `/app/team`, `/app/account`, `/app/integrations`, `/app/audit` | Entities, wallets (+ Sync now), members, settings and reconciliation policy, API keys, audit log |

## Where things live

| What | Where |
|---|---|
| Schema, RLS, all mutation functions (`security definer`, permission checks inside) | `supabase/migrations/*.sql` |
| Supabase clients and session refresh | `src/lib/supabase/*`, `src/proxy.ts` |
| Org context and UI capability checks (`can`) | `src/lib/org.ts` |
| Exact amounts (BigInt, numeric text twins) | `src/lib/money.ts` |
| CSV parsing / export schema v1 / formula neutralisation / checksum | `src/lib/csv.ts`, `src/lib/export-csv.ts` |
| Helius mapper (raw integer amounts) and bounded fetch | `src/lib/helius.ts`; the sync loop is `src/app/app/organization/sync.ts` |
| Integration catalogue (maturity labels are product truth) | `src/lib/integrations.ts` |
| Brand tokens (copied from the site) | `src/app/globals.css`, `public/brand/` |
| Labelled sample data | `docs/samples/*.csv` |

## Roles

`admin` (organization, entities, wallets, members, policy, exports), `operator` (import, context, matching decisions, exceptions), `reviewer` (approve/return, exports), `auditor` (read only). An admin may hold an explicit `financial_role` (operator or reviewer). Self-approval is off per organization by default: the author of the last material decision cannot approve it.

## Known limitations (v1)

Matching is 1:1; partial/grouped payments stay as `unsupported_partial` exceptions (grouped operations are v2, see the contract). Fiat invoices cannot be matched without a valuation source. Approval is per record (no batch close yet). Member invitations by email are not built; members are added by an admin through the database or the future backoffice. Exports are regenerated from frozen rows, not stored as files.
