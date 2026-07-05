import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAdminRequest } from '@/lib/admin-request'
import { toAdminPortalDto } from '@/lib/admin-portal-dto'
import {
  collectPortalStorageUrls,
  deleteClientPortal,
  getClientPortalById,
  isValidTransferRecipients,
  normalizeTransferRecipients,
  parseExpiryForDb,
  updateClientPortal,
} from '@/lib/db'
import { removeStorageObjects } from '@/lib/storage'
import { isPrivateStorageObjectRef } from '@/lib/storage'

function storageBucket(): string | undefined {
  return process.env.SUPABASE_STORAGE_BUCKET
}

const slugSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug: lowercase letters, numbers, hyphens only')

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

const patchSchema = z.object({
  client_name: z.string().min(1).max(200).optional(),
  client_email: z
    .string()
    .min(3)
    .max(1000)
    .refine(isValidTransferRecipients, 'Enter one or more valid email addresses')
    .optional(),
  new_password: z.string().min(4).max(200).optional(),
  slug: slugSchema.optional(),
  expires_at: z.union([z.string().min(1).max(40), z.null()]).optional(),
  files: z.array(fileSchema).min(1).optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const portal = await getClientPortalById(id)
  if (!portal) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ portal: toAdminPortalDto(portal) })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid fields', details: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const before = await getClientPortalById(id)
  if (!before) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const payload = { ...parsed.data }
  if (payload.client_email !== undefined) {
    payload.client_email = normalizeTransferRecipients(payload.client_email)
  }
  if (payload.expires_at !== undefined) {
    try {
      payload.expires_at = parseExpiryForDb(payload.expires_at)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid expiration date'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  const next = await updateClientPortal(id, payload)
  if (!next.ok) {
    return NextResponse.json({ error: next.error }, { status: 400 })
  }

  if (parsed.data.files) {
    const oldUrls = new Set(collectPortalStorageUrls(before))
    const newUrls = new Set(parsed.data.files.map((f) => f.url))
    const toRemove = Array.from(oldUrls).filter((u) => !newUrls.has(u))
    if (toRemove.length) {
      await removeStorageObjects(toRemove)
    }
  }

  const portal = await getClientPortalById(id)
  return NextResponse.json({ portal: portal ? toAdminPortalDto(portal) : null })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const portal = await getClientPortalById(id)
  if (!portal) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const urls = collectPortalStorageUrls(portal)
  await removeStorageObjects(urls)

  const result = await deleteClientPortal(id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
