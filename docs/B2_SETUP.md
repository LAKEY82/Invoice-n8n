# Backblaze B2 setup (free S3-compatible storage alternative to R2)

The app uses the S3 API, so B2 works through the same `R2_*` variables plus `S3_REGION`.

1. **Create a private bucket** (B2 → Buckets → Create a Bucket). Note the bucket name and its **Endpoint**, e.g. `s3.us-east-005.backblazeb2.com`. The region is the middle part: `us-east-005`.
2. **Create an application key** (Application Keys → Add a New Application Key): restrict it to your bucket, type **Read and Write**. Copy the **keyID** and **applicationKey** immediately; the key is shown once.
3. **CORS** (Bucket → CORS Rules → *Add custom rule* / edit JSON), so the browser can upload directly:
   ```json
   [
     {
       "corsRuleName": "invoiceflow",
       "allowedOrigins": ["http://localhost:3000", "https://YOUR-APP.vercel.app"],
       "allowedOperations": ["s3_put", "s3_get", "s3_head"],
       "allowedHeaders": ["*"],
       "exposeHeaders": ["ETag"],
       "maxAgeSeconds": 3600
     }
   ]
   ```
4. **Environment variables**
   ```
   R2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
   S3_REGION=us-east-005
   R2_ACCESS_KEY_ID=<keyID>
   R2_SECRET_ACCESS_KEY=<applicationKey>
   R2_BUCKET_NAME=<bucket name>
   R2_ACCOUNT_ID=b2          # any non-empty value; ignored when R2_ENDPOINT is set
   ```
5. **Test:** upload a PDF on the Upload page, open it in the invoice view, then delete it and confirm the file disappears from the bucket.

Notes: keep the bucket private (all access uses short-lived signed URLs). Free-tier limits and card requirements change; check Backblaze's pricing page. A bucket with *Keep all versions* retains deleted files as hidden versions, so set a lifecycle rule such as "keep only the last version" to stop deleted invoices from using space.
