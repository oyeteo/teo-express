# TEO.EXPRESS - Private File Sharing Platform

A clean, minimalistic, and secure file sharing application built with Next.js and Supabase.

## Features

- **Admin Portal**: Create client portals with custom passwords and file links
- **Client Portal**: Secure, password-protected file downloads with a military HUD-style interface
- **Vintage Red Design**: Clean, professional aesthetic with vintage red color scheme
- **Supabase Integration**: Files stored in Supabase Storage buckets

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Create a storage bucket for your files
3. Run the SQL schema in `supabase-schema.sql` in your Supabase SQL editor
4. Get your project URL and API keys from the Supabase dashboard

### 3. Configure Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

Update `.env.local` with:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (keep this secret!)
- `NEXT_PUBLIC_APP_URL`: Your app URL (e.g., `http://localhost:3000`)

### 4. Upload Files to Supabase Storage

1. Go to your Supabase dashboard
2. Navigate to Storage
3. Upload files to your bucket
4. Get the public URL for each file (format: `https://your-project.supabase.co/storage/v1/object/public/bucket-name/filename.pdf`)

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Creating a Client Portal

1. Navigate to `/admin`
2. Fill in:
   - Client Name (will be used to generate a friendly slug)
   - Client Email
   - Password (for the client to access their file)
   - Supabase File URL (the public URL from your storage bucket)
3. Click "Create Portal"
4. Copy the generated link and send it to your client

### Client Access

1. Client visits the shared link (e.g., `/download/client-name`)
2. Client enters the password
3. Client sees file information in HUD style
4. Client clicks "Download File" to download

## Database Schema

The `client_portals` table stores:
- `id`: Unique identifier
- `client_name`: Name of the client
- `client_email`: Client's email address
- `password_hash`: Hashed password for access
- `file_url`: URL to the file in Supabase Storage
- `slug`: Friendly URL slug (auto-generated from client name)
- `created_at`: Timestamp of creation
- `expires_at`: Optional expiration date

## Security Notes

- Passwords are hashed using bcrypt
- Service role key should never be exposed to the client
- Consider adding expiration dates for temporary file access
- In production, add rate limiting and additional security measures

## Tech Stack

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type safety
- **Supabase**: Database and file storage
- **bcryptjs**: Password hashing

