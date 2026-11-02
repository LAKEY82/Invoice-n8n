# Deploying to Vercel

Prerequisites: [MongoDB Atlas](MONGODB_SETUP.md), [Cloudflare R2](R2_SETUP.md), and (for AI processing) [n8n on Render](N8N_RENDER_DEPLOYMENT.md). The app itself runs without n8n, but uploads then stay *Queued* with a clear message.

1. Push the repo to GitHub/GitLab and **Import** it in Vercel. Framework preset: **Next.js** (auto-detected; no build overrides). `vercel.json` only adds a cron.
2. **Environment variables** (Project → Settings → Environment Variables, scope *Production*, plus *Preview* if you want previews to work). Required:
   `MONGODB_URI`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `N8N_WEBHOOK_URL`, `N8N_API_SECRET`, and `GEMINI_API_KEY` (or per-user keys in Integrations). Every variable is documented in [`.env.example`](../.env.example). Generate secrets with `openssl rand -base64 48`. Set `NEXT_PUBLIC_APP_URL` to the final public URL — n8n uses it to call back, and it is used in reset emails. For password-reset emails add `RESEND_API_KEY` and `EMAIL_FROM`.
3. Deploy. Then add the Vercel URL to the **R2 CORS** allowed origins.
4. Smoke test: register → upload → watch status → review → approve → export.

## How the app fits the platform
- **Node.js runtime** for every route (`export const runtime = "nodejs"`) because Mongoose and ExcelJS need it.
- **No local files.** Uploads go browser → R2 by presigned PUT; downloads/previews use signed GET URLs; exports are generated in memory and streamed back.
- **No long-running work in serverless functions.** OCR / PDF parsing / AI calls run in n8n. Functions only enqueue (≤ `N8N_DISPATCH_TIMEOUT_MS`), receive callbacks, and read/write MongoDB. Function limits: `maxDuration` is 30–60 s on the few routes that dispatch or export (Hobby caps apply).
- **Cold-start friendly:** the Mongo connection is cached on `globalThis`; pools are small (5).
- **Rate limiting** is stored in MongoDB (not memory), so it works across instances.

## Cron
`vercel.json` runs `/api/internal/recover` once a day (the Hobby plan allows daily crons). Set an env var `CRON_SECRET` (random string): Vercel then sends `Authorization: Bearer $CRON_SECRET`, which the endpoint accepts (it also accepts `N8N_API_SECRET`). For faster retries than daily, call the endpoint every few minutes from a free scheduler (cron-job.org, GitHub Actions) with `Authorization: Bearer <N8N_API_SECRET>`. Status polling in an open browser tab performs the same recovery while someone is watching.

## Free-tier limitations
Hobby plan is for non-commercial use, function duration/size limits apply, and there are no fixed egress IPs (hence the Atlas `0.0.0.0/0` rule). Review each provider's current limits before launch.
