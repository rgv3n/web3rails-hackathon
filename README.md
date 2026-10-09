# Web3Rails — front office (app.web3rails.io)

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Supabase (Auth + Postgres + RLS) · lucide-react.

```bash
npm install
npx supabase start        # local stack on ports 573xx (API 57321, DB 57322, Studio 57323, mail 57324)
npm run dev               # http://localhost:3000
npm run build && npm run lint
```

`.env.local` points at the local stack (public demo keys, not secrets). For a hosted project, replace the two variables.

## Where things live

| What | Where |
|---|---|
| Schema and RLS | `supabase/migrations/*.sql` |
| Supabase clients (server, browser) and session refresh | `src/lib/supabase/*`, `src/proxy.ts` |
| Current org + role for the signed-in user | `src/lib/org.ts` (`requireOrg`) |
| Integration catalogue (maturity labels are product truth) | `src/lib/integrations.ts` |
| API key generation (prefix + sha256 stored, secret shown once) | `src/lib/api-keys.ts` |
| Auth pages and actions | `src/app/(auth)/*` |
| Organization onboarding | `src/app/onboarding/*` |
| App shell and pages | `src/app/app/*` |
| Brand tokens (copied from the site) | `src/app/globals.css`, `public/brand/` |

Plan and status: `../docs/2026-10-09-front-office-plan.md`.
