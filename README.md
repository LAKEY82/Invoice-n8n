# InvoiceFlow AI

AI-powered invoice processing SaaS (MVP) designed for free tiers: **Next.js on Vercel**, **MongoDB Atlas**, **Cloudflare R2**, **n8n on Render** (with an external PostgreSQL for n8n's own state) and **Gemini** (OpenAI optional).

Upload PDFs/images → files go straight to R2 → n8n extracts data with AI → totals/duplicates are validated → a human reviews, edits and approves → export to CSV/XLSX and see dashboards/reports.

## Quick start (local)
```bash
npm install
cp .env.example .env.local     # fill MONGODB_URI, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, ENCRYPTION_KEY, R2_*, N8N_*, GEMINI_API_KEY
npm run dev                    # http://localhost:3000
```
Minimum to browse the app: `MONGODB_URI`, Clerk keys, `ENCRYPTION_KEY` (≥32 chars). Uploads need R2; extraction needs n8n + an AI key. The UI shows honest "not configured" states instead of faking connections.

Local n8n: `npx n8n`, import `n8n/invoice-processing-workflow.json`, follow [docs/N8N_RENDER_DEPLOYMENT.md](docs/N8N_RENDER_DEPLOYMENT.md) (§3–4, "Local development").

## Scripts
`npm run dev` · `npm run build` · `npm run start` · `npm run lint` · `npx tsc --noEmit` · `node n8n/build-workflow.mjs` (regenerate workflow JSON)

## Documentation
- [Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md)
- [MongoDB Atlas](docs/MONGODB_SETUP.md) · [Cloudflare R2](docs/R2_SETUP.md)
- [Vercel](docs/VERCEL_DEPLOYMENT.md) · [n8n on Render](docs/N8N_RENDER_DEPLOYMENT.md)
- Environment variables: [.env.example](.env.example) (every variable documented)

## Free-tier limitations
Render Free sleeps (first processing after idle can take ~1 min; the app retries automatically), 512 MB RAM for n8n, Vercel Hobby function limits and daily cron, Atlas M0 512 MB, Gemini free-tier rate limits, and R2 needs a payment method on file. Details in the deployment guides.

## Status of verification
Type-check, lint and production build pass. An end-to-end script (58 checks) against an in-memory MongoDB passed for auth, tenant isolation, upload validation, callbacks, retry/backoff/recovery, duplicate detection, approval rules, dashboards, exports and secret handling. **Not yet exercised against real services:** R2 uploads/CORS, a live n8n import, and live Gemini/OpenAI calls. Do the checks in the deployment guides before production use.
