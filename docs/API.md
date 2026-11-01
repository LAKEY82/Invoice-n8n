# API reference

All routes return JSON errors `{ "error": string, "code": string }` (validation errors add `issues`). User routes require the session cookie; `/api/internal/*` requires `Authorization: Bearer <N8N_API_SECRET>`.

## Auth
| Method & path | Body | Notes |
|---|---|---|
| POST `/api/auth/register` | `name, email, password` (≥10 chars, letter+number) | sets session cookie |
| POST `/api/auth/login` | `email, password` | rate-limited |
| POST `/api/auth/logout` | – | clears cookie |
| POST `/api/auth/forgot-password` | `email` | always 200 |
| POST `/api/auth/reset-password` | `token, password` | invalidates old sessions |

## Invoices
| Method & path | Description |
|---|---|
| GET `/api/invoices` | query: `q, status, supplier, from, to, sort, dir, page, pageSize` → `{items,total,page,pages,suppliers}` |
| POST `/api/invoices/upload-url` | `{fileName,fileType,fileSize,fileHash}` → `{invoiceId,uploadUrl,method,headers,duplicateOf}` |
| POST `/api/invoices/:id/complete` | verify upload, start processing |
| GET `/api/invoices/status` | `?ids=a,b` (optional) → `{items,activeCount}`; also triggers recovery |
| GET `/api/invoices/:id` · PATCH · DELETE | read / edit (validated) / delete with R2 object |
| POST `/api/invoices/:id/approve` | `{acknowledgeWarnings?}`; 409 if errors/duplicate and not acknowledged |
| POST `/api/invoices/:id/reject` · `/duplicate` · `/reprocess` | review actions |
| GET `/api/invoices/:id/download` | `?disposition=attachment` → `{url}` (short-lived signed URL) |
| POST `/api/invoices/bulk` | `{action:"delete"\|"approve", ids[]}` |

## Dashboard, reports, exports
`GET /api/dashboard/stats` · `GET /api/reports?from&to&approvedOnly` · `GET /api/exports/invoices?format=csv|xlsx&…filters…&ids=` · `GET /api/exports/reports?format=csv|xlsx&from&to&approvedOnly`

## Integrations
`GET /api/integrations` (no secrets) · `PATCH /api/integrations {preferredProvider}` · `PUT|DELETE /api/integrations/:gemini|openai` · `POST /api/integrations/:gemini|openai|n8n/test`

## Internal (n8n / cron)
| Method & path | Description |
|---|---|
| GET `/api/internal/jobs/:jobId` | job data: `downloadUrl` (5 min), `fileType`, `ai:{provider,apiKey,model}` |
| POST `/api/internal/jobs/:jobId/result` | `{status:"success",extraction,provider,model}` or `{status:"error",error,retryable}` → `{applied,status}` (idempotent) |
| GET/POST `/api/internal/recover` | retry due jobs, release stuck ones, clean orphans; accepts `N8N_API_SECRET` or `CRON_SECRET` |

## Webhook to n8n
`POST $N8N_WEBHOOK_URL` with `Authorization: Bearer <N8N_API_SECRET>`, `Idempotency-Key: <jobId>`, body `{jobId, invoiceId, appUrl}`. Expect 2xx quickly; anything else (or timeout) schedules a retry.
