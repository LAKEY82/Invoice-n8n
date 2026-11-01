# Cloudflare R2 setup

R2 stores the original invoice files. The browser uploads **directly** to R2 with a short-lived presigned URL, so file bytes never pass through Vercel.

1. **Create a bucket** – Cloudflare dashboard → *R2 Object Storage → Create bucket* (e.g. `invoiceflow-invoices`). Keep it **private** (do not enable the public `r2.dev` URL or a public custom domain). R2 requires a payment method on file but the free tier (10 GB, 1M writes, 10M reads / month) is enough for an MVP.
2. **Account ID** – shown on the R2 overview page → `R2_ACCOUNT_ID`.
3. **API credentials** – *R2 → Manage R2 API Tokens → Create API token*. Permission **Object Read & Write**, scoped to your bucket. Copy the **Access Key ID** and **Secret Access Key** (shown once) → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
4. **CORS** (required for browser uploads) – bucket → *Settings → CORS Policy*:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://YOUR-APP.vercel.app"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Add your custom domain / preview URL if you use one. Do not use `*` in production.
5. **Optional lifecycle rule** – *Settings → Object lifecycle rules*: abort incomplete multipart uploads after 1 day. (Orphaned single-PUT uploads are already cleaned up by the app's recovery sweep.)
6. **Environment variables**
   ```
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET_NAME=invoiceflow-invoices
   # R2_ENDPOINT is optional; default https://<account>.r2.cloudflarestorage.com
   ```

## Testing
1. Run the app, sign in, open **Dashboard → Upload**, and drop a small PDF. The row should reach 100 % and then show *Queued/Processing* (a missing CORS rule shows "Network error … check the R2 bucket CORS settings").
2. Open the invoice: the left panel shows the PDF (served via a signed GET URL that expires after `DOWNLOAD_URL_TTL_SECONDS`, default 5 min) and **Download** works.
3. In the Cloudflare dashboard the object appears under `invoices/<userId>/<yyyy-mm>/<uuid>.pdf`.
4. Delete the invoice in the app – the object disappears from the bucket.

## Behaviour worth knowing
- After upload the server **verifies** the object exists, matches the declared size, and has the right file signature (`%PDF-`, PNG, JPEG magic bytes). Failed checks delete the object and the record.
- Uploads that never complete (tab closed) leave a `PENDING_UPLOAD` record; the recovery sweep deletes them and their objects after 2 hours.
- Object keys are always built server-side and prefixed with the authenticated user's id; the client cannot choose a key.
