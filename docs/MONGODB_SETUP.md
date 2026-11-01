# MongoDB Atlas setup (free M0)

1. **Create a cluster** – <https://cloud.mongodb.com> → *Build a Database* → **M0 Free**. Pick a region close to your Vercel region (e.g. AWS `us-east-1` for Vercel `iad1`).
2. **Create a database user** – *Security → Database Access → Add New Database User* → password auth. Use a generated password and the built-in role **Read and write to any database** (or scope it to the `invoiceflow` database). Avoid `@ : / ?` in the password or URL-encode them.
3. **Network access** – *Security → Network Access → Add IP Address*. Vercel serverless functions have no fixed IPs on the free plan, so use **0.0.0.0/0 (Allow access from anywhere)**. This is acceptable because access is still protected by the long random user password and TLS. Do not use this entry for anything else, and rotate the password if it leaks. (Vercel's paid static-IP add-on lets you restrict this later.)
4. **Connection string** – *Database → Connect → Drivers → Node.js*. Copy the `mongodb+srv://…` string, replace `<password>`, and **add the database name** before the `?`:
   ```
   mongodb+srv://invoiceflow:<password>@cluster0.xxxxx.mongodb.net/invoiceflow?retryWrites=true&w=majority
   ```
5. **Set `MONGODB_URI`** – in `.env.local` for development and in Vercel → Project → Settings → Environment Variables for production.

## Indexes
Mongoose creates the indexes on first connection (`autoIndex`). They are intentionally few: `users.email` (unique), and on `invoices`: `(userId, invoiceDate)`, `(userId, processingStatus)`, `(userId, fileHash)`, `(userId, supplierKey, invoiceNumberKey)`, `(userId, createdAt)`, `jobId` (sparse). `processinglogs` expire after 90 days and `ratelimits` expire automatically (TTL) to protect the 512 MB quota.

## Free-tier notes
- 512 MB storage. Only structured data is stored — never files (those live in R2).
- M0 allows ~500 connections; the app keeps a pool of 5 per serverless instance.
- Clusters pause after 60 days of inactivity.
