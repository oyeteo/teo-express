# TEO.EXPRESS

Fast private file transfers with branded recipient download pages.

## What It Does

- Upload one or more files to Supabase Storage.
- Create a share link; recipients are an optional label.
- Record when the link is opened and when each file is downloaded.
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

### Supabase CLI

This repo includes the Supabase CLI as a dev dependency and keeps CLI migrations in `supabase/migrations`.

Authenticate once:

```bash
npm run supabase:login
```

For non-interactive shells, create a Supabase access token and pass it without committing it:

```bash
npm run supabase:login -- --token "$SUPABASE_ACCESS_TOKEN"
```

Link this checkout to the project in `.env.local`:

```bash
npm run supabase:link
```

`supabase:link` derives the project ref from `NEXT_PUBLIC_SUPABASE_URL`. If you need to override it, set `SUPABASE_PROJECT_REF`.

Common project commands:

```bash
npm run supabase:projects
npm run supabase:migrations
npm run supabase:db:push
npm run supabase:db:pull -- --schema public
```

Local Supabase commands:

```bash
npm run supabase:start
npm run supabase:status
npm run supabase:stop
```

The local config creates a private `client-files` storage bucket, matching `.env.local.example`. If your private `.env.local` uses a different `SUPABASE_STORAGE_BUCKET`, add or rename a matching `[storage.buckets.<bucket>]` entry in `supabase/config.toml` before using `npm run supabase:start`. Keep the production bucket private too.

## Sender CLI

The fastest sender flow is the CLI. It is intended for trusted internal operators because it reads `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.

Link it once to make `teo-express` available globally:

```bash
npm link
```

When run outside this directory, the linked CLI falls back to this checkout's `.env.local`. Set `TEO_EXPRESS_ENV_FILE` to use a different config file.

Send a file. The name comes from the file, the link is printed and copied to the clipboard, and nobody needs an email address:

```bash
teo-express ./Final.mov
```

Send several files under one name, with recipients as a label and an access code:

```bash
teo-express ./contract.pdf ./appendix.pdf --name "Acme sensitive files" --to client@example.com --code "long-random-code"
```

Set a custom expiry with `--days 3` or `--expires 2026-12-31T23:59:00Z`. Add `--watch` to keep the terminal open until the first download lands.

Know it landed. Every open of the download page and every download click is recorded as a receipt:

```bash
teo-express ls                          # recent transfers with open/download counts
teo-express status final-mov            # files, expiry, last open, last download, device
teo-express watch final-mov             # waits for the first download, then sends a macOS notification
teo-express extend final-mov --days 7   # push the expiry out
teo-express rm final-mov                # delete the transfer and its files
teo-express open final-mov              # open the download page in the browser
```

Every command accepts the slug or the full link. Links use `https://x.teo.fm`; set `TEO_EXPRESS_PUBLIC_URL` to point at another deployment.

Validate input without Supabase credentials or uploads:

```bash
teo-express --dry-run ./sample.txt
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

Against the live site, prove the whole loop (send, page, signed download with sha256 check, receipt, status, ls, extend, rm) with a throwaway transfer:

```bash
npm run test:transfer-roundtrip
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
