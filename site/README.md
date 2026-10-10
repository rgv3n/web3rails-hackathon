# Web3Rails — institutional website

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · lucide-react. No other runtime dependencies.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
npm run lint
```

## Where things live

| What | Where |
|---|---|
| Brand tokens (colors, fonts) | `src/app/globals.css` (documented in `brand.md`) |
| All data-like copy: demo table, metrics, capabilities, architecture maturity labels, API samples | `src/lib/demo-data.ts` |
| Homepage sections, one file each | `src/components/*` |
| Homepage assembly | `src/app/page.tsx` |
| Metadata, JSON-LD, fonts, skip link | `src/app/layout.tsx` |
| Secondary pages | `src/app/{contact,privacy,terms}/page.tsx` |

## Product-truth rules baked into the site

- Every figure in the dashboard is labelled **Demo data · illustrative**.
- Every architecture node carries **MVP / Prototype / Planned**. Edit the status in `demo-data.ts`, never in the component.
- No certifications, customers, partners or volumes are claimed anywhere. The Security section says so explicitly.
- Contact email used across the site: `hello@web3rails.io` (assumed; change in `Company.tsx`, `FinalCta.tsx`, `layout.tsx` and the contact/legal pages).
