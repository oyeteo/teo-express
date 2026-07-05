import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminRequest } from '@/lib/admin-request'
import {
  createClientPortal,
  isValidTransferRecipients,
  listClientPortals,
  normalizeTransferRecipients,
  parseExpiryForDb,
} from '@/lib/db'
import { toAdminPortalDto } from '@/lib/admin-portal-dto'
import { isPrivateStorageObjectRef } from '@/lib/storage'

function storageBucket(): string | undefined {
  return process.env.SUPABASE_STORAGE_BUCKET
}

const fileSchema = z.object({
  id: z.string().min(1).max(80),
  url: z
    .string()
    .min(1)
    .refine((value) => isPrivateStorageObjectRef(value, storageBucket()), {
      message: 'File reference must be a private Supabase storage ref from the configured bucket',
    }),
  name: z.string().min(1).max(512),
})

const createSchema = z.object({
  client_name: z.string().min(1).max(200),
  client_email: z
    .string()
    .min(3)
    .max(1000)
    .refine(isValidTransferRecipients, 'Enter one or more valid email addresses'),
  password: z.string().max(200).optional(),
  /** ISO-ish string from datetime-local or Date; omitted means default expiry */
  expires_at: z.union([z.string().min(1).max(40), z.null()]).optional(),
  files: z.array(fileSchema).min(1),
})

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await listClientPortals()
  return NextResponse.json({ portals: rows.map(toAdminPortalDto) })
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid fields', details: parsed.error.flatten() }, { status: 400 })
  }

  const { client_name, client_email, password, files, expires_at } = parsed.data

  let expiresForDb: string | null
  try {
    expiresForDb = parseExpiryForDb(expires_at)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid expiration date'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const result = await createClientPortal(
    client_name,
    normalizeTransferRecipients(client_email),
    password,
    files,
    expiresForDb
  )

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ slug: result.slug, id: result.id })
}
