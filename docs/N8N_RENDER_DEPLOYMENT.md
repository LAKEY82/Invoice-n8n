# n8n on Render (free) — deployment & operations

> The workflow in `n8n/invoice-processing-workflow.json` has been checked for wiring and its Code nodes were unit-tested with mocked inputs, but it has **not been run inside a live n8n instance** by the author. Do the end-to-end test in step 7 before relying on it.

## 1. PostgreSQL for n8n's own state
Render Free web services have an **ephemeral filesystem** and **sleep after ~15 minutes** of inactivity, so n8n must not use its default SQLite file. Create a free external PostgreSQL (e.g. [Neon](https://neon.tech) or Render's free Postgres, which expires after 30 days — Neon is better for long-lived use). This database holds n8n workflows, credentials and execution history only; business data stays in MongoDB.
Note host, port, database, user, password. Use the **direct** (non-pooled) host and require SSL.

## 2. Deploy the service
- Render → *New → Blueprint* → pick this repo → Blueprint file path `n8n/render.yaml`. (Or create a Web Service from the Docker image `docker.io/n8nio/n8n` and copy the variables.)
- Fill the prompted variables:

| Variable | Value |
|---|---|
| `DB_POSTGRESDB_HOST/DATABASE/USER/PASSWORD` | from step 1 (`DB_TYPE=postgresdb`, port 5432, SSL on are preset) |
| `N8N_ENCRYPTION_KEY` | `openssl rand -hex 32`. **Back it up**; without it stored credentials are unreadable |
| `N8N_HOST` | `<service>.onrender.com` |
| `N8N_PROTOCOL` | `https` |
| `WEBHOOK_URL` | `https://<service>.onrender.com/` (trailing slash) |

The preset `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` and pruning keep invoice contents and the AI key out of the database and the free DB small. Never hardcode credentials in the YAML.

## 3. Create the shared secret credential
Open n8n (first visit creates the owner account) → *Credentials → New → Header Auth*:
- Name: **InvoiceFlow API Secret**
- Header name: `Authorization`
- Value: `Bearer <N8N_API_SECRET>` — the same random string you set as `N8N_API_SECRET` in Vercel (`openssl rand -hex 32`).

This one credential authenticates inbound webhooks and the outbound calls to the Next.js internal API.

## 4. Import and activate the workflow
*Workflows → Import from file* → `n8n/invoice-processing-workflow.json`. Open the **Webhook**, **Get job** and **Send result** nodes and select the credential from step 3. Toggle the workflow **Active**.
The production webhook URL is `https://<service>.onrender.com/webhook/invoiceflow-process` → set it as `N8N_WEBHOOK_URL` in Vercel.
(`n8n/build-workflow.mjs` regenerates the JSON if you want to change the Code nodes.)

## 5. AI keys
The workflow does **not** hold the AI key. Next.js passes the user's (or the server's) Gemini/OpenAI key in the job payload fetched over the authenticated internal API, so keys are managed in **Dashboard → Integrations** or the `GEMINI_API_KEY` env var.

## 6. Cold starts & recovery strategy
Render wakes a sleeping free service on the first request, which can take **30–60+ seconds**. The design never treats that as a failure:

1. Upload completes → invoice is claimed atomically (`PENDING → PROCESSING`, new `jobId`, attempt +1) and the job is POSTed to n8n with an `Idempotency-Key`. The workflow replies **202 immediately**, so the call is short once awake.
2. Next.js waits at most `N8N_DISPATCH_TIMEOUT_MS` (8 s). On timeout / 5xx / 429 / network error the invoice goes back to **`PENDING`** with `nextRetryAt` using exponential backoff (30 s, 1 m, 2 m, 4 m … capped at 15 m). That first request also wakes the service.
3. Retries are triggered by (a) the browser's status polling while someone is watching, and (b) a Vercel Cron call to `/api/internal/recover` (daily on Hobby; call it more often from any free scheduler such as cron-job.org or a GitHub Actions schedule with `Authorization: Bearer $N8N_API_SECRET`).
4. After `PROCESSING_MAX_ATTEMPTS` (default 5) the invoice becomes **`FAILED`** with the reason; **Reprocess** resets it.
5. If n8n accepted the job but never calls back (crash, redeploy), the sweep releases `PROCESSING` jobs older than `PROCESSING_TIMEOUT_MINUTES` (10) and retries.
6. Callbacks are idempotent: only the invoice's *current* `jobId` in `PROCESSING` is accepted; stale/duplicate callbacks return `applied:false`. A retry after an ambiguous timeout may make n8n process the same invoice twice, but only one result is applied.
7. Inside the workflow, HTTP nodes retry (3–5×), AI rate limits (429) / 5xx / timeouts are classified `retryable:true` and pushed through the same backoff; malformed JSON from the AI is retried; blocked/empty responses and 400/401/403 fail permanently with a readable message.

Keep-warm option: ping `https://<service>.onrender.com/healthz` every 10 minutes from a free uptime monitor. This conflicts with Render's free instance-hours allowance (750 h/month ≈ one always-on service), so check your account's usage.

## 7. Verify end to end
1. **Dashboard → Integrations → n8n → Test connection** (first call may take ~1 min).
2. Upload a PDF. Status moves *Queued → Processing → Review required*.
3. In n8n *Executions* (only errors are stored by default) confirm no failures; temporarily set `EXECUTIONS_DATA_SAVE_ON_SUCCESS=all` while debugging, then revert.
4. Turn n8n off (suspend the service) and upload: the invoice must stay *Queued* with the reason shown, then process after you resume it.

## Local development (SQLite)
```bash
npx n8n            # SQLite in ~/.n8n, UI at http://localhost:5678
```
Use `N8N_WEBHOOK_URL=http://localhost:5678/webhook/invoiceflow-process`. n8n must reach the app: `NEXT_PUBLIC_APP_URL=http://localhost:3000` works when both run on one machine. For a deployed app with local n8n (or vice versa) use a tunnel such as Cloudflare Tunnel. The webhook path `/webhook/…` is the production URL (workflow active); `/webhook-test/…` only works while *Listen for test event* is running.

## Free-tier limitations
512 MB RAM (large scanned PDFs are processed as binary files on disk, but heavy parallel jobs can still OOM — keep uploads ≤ 10 MB), shared CPU, spin-down, and limited monthly instance hours. Gemini's free tier has per-minute and per-day request limits; hitting them yields `retryable` errors and automatic backoff.
