# Web3Rails · notes for the Crypto World's Fair judges

Stablecoin payments turned into reconciled, approved, audit-ready records, with wallet ownership proven by an eIDAS qualified certificate plus the wallet's own key. Solana first, USDC first. Read-only: Web3Rails never holds keys or moves funds.

This repository is a filtered copy of our private monorepo, published for review. Internal planning documents and credentials folders were removed; the commit history is otherwise intact.

## What to look at

| Where | What it shows |
|---|---|
| https://app.web3rails.io | Hosted front office. Sign in with the judges account given in the submission form; it is an auditor (read-only) in the organization "Acme Ltd. (demo)". |
| `app/supabase/migrations/` | The financial model: movements with three independent state dimensions, idempotency keys, versioned context, 1:1 invoice matching with named signals, exceptions, reviews, frozen exports. All rules live in SQL (`security definer` functions + RLS). |
| `app/src/lib/attestation/` | Qualified-signature verification: CAdES (pkijs), chain to the FNMT root, OCSP, tax-id policy, HMAC-sealed verdict; ed25519 wallet proof linked to the certificate signature. |
| `app/src/lib/solana-anchor.ts` | Export checksum anchored as a Memo transaction: `web3rails:export:<export-id>:<sha256>`. |
| `app/src/lib/sas.ts`, `sas-fields.ts` | Opt-in attestation on the Solana Attestation Service: five fields, nothing derived from the tax id. |
| `app/src/lib/helius.ts` | Read-only ingestion of wallet activity (Helius Enhanced Transactions API, mainnet). |
| `app/src/app/api/mcp/` | Read-only MCP server so a finance team's AI assistant can query its own organization with an API key. |
| `app/tests/` | 64 automated tests against a real local Postgres (Supabase), including real CAdES and ed25519 signatures. |

## On devnet

- Anchor and SAS issuer key: `7NAuHLSY97MYARMuixs2Mc6qq8EqysRh4Fu7sHV3reiS` ([explorer](https://explorer.solana.com/address/7NAuHLSY97MYARMuixs2Mc6qq8EqysRh4Fu7sHV3reiS?cluster=devnet)). Export anchors are Memo transactions signed by this key.
- Solana Attestation Service: credential `WEB3RAILS`, schema `WALLET-OWNERSHIP` v1, program `22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`.
- Mainnet is read only. Writes go to devnet by default (`SAS_MAINNET` unset).

## Run the tests

```bash
cd app
npm install
npx supabase start                       # local stack on ports 573xx, applies supabase/migrations
export SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2- | tr -d '"')
npm test                                 # 64 tests
```

After `npx supabase db reset`, run `scripts/local-hmac-secret.sh` so the attestation tests find their Vault secret. Details in `app/README.md`.

## What is real and what is demo

- The hosted app, the migrations, the signature verification, the anchoring and the SAS issuance code are the production code.
- "Acme Ltd. (demo)" holds sample movements imported from CSV with placeholder signatures and addresses, so they have no explorer links. Devnet anchors made from that organization are real transactions.
- A real Helius sync against a high-volume mainnet wallet has not been exercised yet; the sync path is covered by unit tests with recorded payloads.
- Qualified-signature verification is tested with a demo certificate authority and the demo `.p12` in `app/public/demo-certificate/` (password in the UI). Production accepts FNMT certificates only.

## Timeline and tooling

Scaffold on 23 September 2026; the product in this repository was built between 9 and 12 October 2026 by the two founders, with AI coding assistants (commits carry `Co-Authored-By` lines). Earlier exploratory work under the former name OnchainOps is disclosed in the submission form.

Contact: through the Colosseum Arena project page.
