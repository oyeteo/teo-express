# TEO.EXPRESS

Fast private file transfers with branded recipient download pages.

## What It Does

- Upload one or more files to Supabase Storage.
- Create a share link for one or more recipients.
- Expire every transfer by default after 14 days.
- Optionally protect sensitive transfers with an access code.
- Give recipients a clean Teo-branded page with short-lived signed download URLs.

## Environment

Create `Code/Web/.env.local` from `.env.local.example`:

```bash
cp .env.local.example .env.local
```

Required variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
TEO_ADMIN_PASSWORD=
TEO_ADMIN_SESSION_SECRET=
TEO_ADMIN_MAX_UPLOAD_BYTES=104857600
```

Keep `SUPABASE_SERVICE_ROLE_KEY`, `TEO_ADMIN_PASSWORD`, and `TEO_ADMIN_SESSION_SECRET` server-side only.

## Supabase

For a new project, run `supabase-schema.sql`.

For an existing `express_client_portals` table, run `supabase-migration-portal-files.sql`. It adds multi-file metadata, makes access codes optional, and ensures transfers have an expiration timestamp.

Use a private storage bucket. This is required. TEO.EXPRESS stores internal `supabase://bucket/path` object references and gives recipients short-lived signed URLs only after the transfer is opened.

The schema and migration revoke public table access for `anon` and `authenticated`; server routes and the CLI use the service role key from trusted environments only.

## Sender CLI

The fastest sender flow is the CLI. It is intended for trusted internal operators because it reads `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.

```bash
npm run transfer:create -- \
  --name "Acme final delivery" \
  --to client@example.com,producer@example.com \
  --file ./Final.mov \
  --file ./Stems.zip
```

Add a strong access code for sensitive files:

```bash
npm run transfer:create -- \
  --name "Acme sensitive files" \
  --to client@example.com \
  --file ./contract.pdf \
  --code "use-a-long-client-specific-code"
```

Set a custom expiry:

```bash
npm run transfer:create -- \
  --name "Weekend review" \
  --to client@example.com \
  --file ./review.mp4 \
  --days 3
```

Validate input without Supabase credentials or uploads:

```bash
npm run transfer:create -- --dry-run --name "Test" --to test@example.com --file ./sample.txt
```

The CLI prints the recipient link and does not print secrets.

## Internal Admin UI

Run locally:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/admin`, sign in with `TEO_ADMIN_PASSWORD`, and create a transfer. The admin UI supports multiple files, comma-separated recipients, default expiration, optional access code, and copy-link.

The browser uploader is for small/medium internal uploads and is limited by `TEO_ADMIN_MAX_UPLOAD_BYTES` (default 100 MB). Use the CLI for large files; it streams file data directly to Supabase Storage.

## Recipient Flow

Recipients open:

```text
/download/<slug>
```

If no access code is required, the page prepares signed download links immediately. If the transfer is protected, the recipient enters the access code first. Expired transfers show an unavailable state and do not generate signed download URLs.

## Verification

```bash
npm run test:transfer-cli
npm run build
```

`npm run lint` uses `next lint`; if the project has not been configured for ESLint yet, Next may prompt for setup instead of running non-interactively.

## Production Checklist

- Run `supabase-schema.sql` for a new project or `supabase-migration-portal-files.sql` for an existing project.
- Confirm `SUPABASE_STORAGE_BUCKET` is private.
- Set all required env vars in the deployment target.
- Keep `SUPABASE_SERVICE_ROLE_KEY` out of frontend bundles and only in server/CLI environments.
- Set a long random `TEO_ADMIN_SESSION_SECRET`.
- Set a strong `TEO_ADMIN_PASSWORD`.
- Set `NEXT_PUBLIC_APP_URL` to the production origin before creating links.
- Use the CLI for large transfers.
- Run `npm run lint`, `npm run test:transfer-cli`, and `npm run build` before deploy.

Rate limiting is in-process and intended for a single long-lived Node deployment. If you deploy multiple instances or serverless functions, add platform/shared rate limiting for `/admin/login` and `/api/download/verify/:slug`.
