# Web3Rails

Stablecoin payment reconciliation for finance teams (Solana / USDC first).

| Folder | What | Where it runs |
|---|---|---|
| `site/` | Public website (web3rails.io) | Vercel |
| `app/` | Front office (app.web3rails.io): Next.js 16 + Supabase | Local only until the hosted Supabase and Helius accounts exist |
| `docs/` | Product plan and the front office ↔ engine ↔ backoffice contract | — |
| `logo/` | Brand assets | — |

Each package has its own README with setup and test commands. Migrations live only in `app/supabase/migrations`.
