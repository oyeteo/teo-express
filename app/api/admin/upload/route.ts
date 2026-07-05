import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isAdminRequest } from '@/lib/admin-request'
import { supabaseAdmin } from '@/lib/supabase'
import { storageObjectRef } from '@/lib/storage'

export const runtime = 'nodejs'

const DEFAULT_MAX_ADMIN_UPLOAD_BYTES = 100 * 1024 * 1024

function storageBucket(): string {
  const b = process.env.SUPABASE_STORAGE_BUCKET
  if (!b) {
    throw new Error('SUPABASE_STORAGE_BUCKET is not set')
  }
  return b
}

function safeFileName(name: string): string {
  const base = name.replace(/[/\\]/g, '').replace(/\.\./g, '').trim() || 'file'
  return base.replace(/[^\w.\-() ]/g, '_').slice(0, 200)
}

function maxAdminUploadBytes(): number {
  const raw = process.env.TEO_ADMIN_MAX_UPLOAD_BYTES
  const parsed = raw ? Number(raw) : DEFAULT_MAX_ADMIN_UPLOAD_BYTES
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ADMIN_UPLOAD_BYTES
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let bucket: string
  try {
    bucket = storageBucket()
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Config error'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  const maxBytes = maxAdminUploadBytes()
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `Admin upload limit is ${Math.floor(maxBytes / 1024 / 1024)} MB. Use the CLI for large files.` },
      { status: 413 }
    )
  }

  const folder = randomUUID()
  const path = `portals/${folder}/${safeFileName(file.name)}`
  const buf = Buffer.from(await file.arrayBuffer())

  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    url: storageObjectRef(bucket, path),
    path,
    name: safeFileName(file.name),
  })
}
