# Architecture

```
Browser ──► Vercel (Next.js, Node runtime)
              │  auth • dashboard • invoices • reports • API routes
              ├──► MongoDB Atlas   users, invoices, processinglogs, integrations, businesssettings, ratelimits
              ├──► Cloudflare R2   original files (browser PUTs directly via presigned URL)
              └──► n8n on Render ──► Gemini / OpenAI
                      ▲   │ 1. GET  /api/internal/jobs/:jobId    (file URL + AI config)
                      │   │ 2. POST /api/internal/jobs/:jobId/result
                      └───┘ authenticated with the shared N8N_API_SECRET
```

## Upload → approval
1. `POST /api/invoices/upload-url` — validates metadata (type, size ≤ `MAX_UPLOAD_MB`, SHA-256), creates the invoice as `PENDING_UPLOAD`, returns a presigned PUT for a server-generated key `invoices/<userId>/<yyyy-mm>/<uuid>.<ext>`.
2. Browser PUTs the file to R2 (progress, cancel, retry in the UI).
3. `POST /api/invoices/:id/complete` — verifies the object (exists, size, magic bytes). Same file hash already stored ⇒ `DUPLICATE` (no AI cost). Otherwise `PENDING` and the job is dispatched.
4. Dispatch atomically claims the invoice (`PENDING → PROCESSING`, `jobId`, `attempts+1`) so it can never run concurrently, then POSTs `{jobId, invoiceId, appUrl}` to n8n.
5. n8n fetches the job, downloads the file, extracts PDF text (digital) or uses vision (scanned/images), calls the AI, parses and coerces the JSON, then POSTs the result.
6. The callback re-validates with Zod, runs arithmetic/date checks, detects duplicates (supplier + invoice number, normalised), and sets `REVIEW_REQUIRED` or `DUPLICATE`. **Nothing is auto-approved.**
7. A human reviews/edits (validation re-runs live and on save), then approves. Approval with blocking errors or a duplicate flag needs an explicit override; bulk approval never overrides.

## Status model
`PENDING_UPLOAD → PENDING → PROCESSING → REVIEW_REQUIRED → APPROVED`, with `FAILED` and `DUPLICATE` as side exits. Reject sets `FAILED` ("Rejected by reviewer"). Transient failures return `PROCESSING → PENDING` with `nextRetryAt` (exponential backoff, capped); only exhausted attempts or permanent errors reach `FAILED`.

## Resilience
| Concern | Mechanism |
|---|---|
| n8n asleep / down | short dispatch timeout → `PENDING` + backoff; never `FAILED` on first miss |
| Lost job | `PROCESSING` older than `PROCESSING_TIMEOUT_MINUTES` is released and retried |
| Duplicate / stale callbacks | accepted only for the current `jobId` while `PROCESSING` |
| Concurrent processing | atomic `findOneAndUpdate` claim; reprocess refused while running |
| AI rate limits / malformed JSON | classified `retryable`, same backoff |
| Orphaned uploads | `PENDING_UPLOAD` > 2 h ⇒ R2 object and record deleted by the sweep |
| Audit trail | `processinglogs` entries per attempt/event (90-day TTL) |

Recovery runs from status polling (while a user watches), `/api/internal/recover` (cron), and on each manual reprocess.

## Security
- Session: HS256 JWT in an `HttpOnly`, `SameSite=Lax`, `Secure` (prod) cookie; validated against the DB on every request (`tokenVersion` revokes sessions on password reset). The edge `proxy.ts` is only an optimistic redirect — every handler re-checks.
- All invoice queries include the session's `userId`; IDs are never taken from the client. Cross-user access returns 404.
- Passwords: bcrypt (cost 12), timing-equalised login, generic forgot-password response, hashed single-use reset tokens (30 min).
- Rate limits (MongoDB-backed) on login, register, forgot/reset, upload, reprocess, export, integrations.
- Integration API keys: AES-256-GCM at rest, never returned (only a masked hint).
- Internal API and webhook: shared secret, constant-time comparison.
- Exports neutralise spreadsheet formula injection. Search input is regex-escaped. Security headers set in `next.config.ts`.

## Known limitations (MVP)
- Duplicate detection by supplier + number depends on the extracted text being consistent.
- Mixed-currency data is reported per currency; the dashboard headline shows only the default currency and notes the rest.
- Google Sheets is not implemented; the Integrations page says so.
- The AI key travels to n8n in the job payload (over HTTPS, authenticated). n8n stores error executions by default — see the n8n doc.
- No automated test suite is committed; verification was done with an end-to-end script against an in-memory MongoDB (auth, isolation, callbacks, retries, recovery, exports). R2 uploads and a live n8n/AI run were **not** exercised.
