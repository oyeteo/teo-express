import { NextRequest, NextResponse } from 'next/server'
import { getClientPortalBySlug, transferRequiresAccessCode, verifyPassword } from '@/lib/db'
import { generateSignedUrl, getFileMetadata, parseStorageUrl } from '@/lib/storage'
import { listPortalFiles } from '@/lib/portal-model'
import { checkRateLimit, clearRateLimit, clientIp } from '@/lib/rate-limit'
import { recordTransferEvent } from '@/lib/transfer-events'

function getFileNameFromUrl(url: string) {
  try {
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    return pathParts[pathParts.length - 1] || 'file'
  } catch {
    const parsed = parseStorageUrl(url)
    if (parsed) {
      return parsed.path.split('/').pop() || 'file'
    }
    return 'file'
  }
}

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  })
}

function isRefreshBeforeDownload(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get('refresh') === '1'
}

async function noteOpened(portalId: string, slug: string, request: NextRequest) {
  if (isRefreshBeforeDownload(request)) return
  const ip = clientIp(request.headers)
  const limited = checkRateLimit(`opened:${slug}:${ip}`, 20, 10 * 60 * 1000)
  if (!limited.ok) return
  await recordTransferEvent({
    portalId,
    kind: 'opened',
    userAgent: request.headers.get('user-agent'),
  })
}

async function buildDownloadResponse(slug: string, request: NextRequest, password?: string) {
  const portal = await getClientPortalBySlug(slug)

  if (!portal) {
    return json({ error: 'Invalid download link' }, 404)
  }

  if (portal.expires_at) {
    const expiresAt = new Date(portal.expires_at)
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      return json({ error: 'This download link has expired' }, 410)
    }
  }

  const requiresAccessCode = transferRequiresAccessCode(portal.password_hash)
  if (requiresAccessCode) {
    if (!password) {
      return json({
        clientName: portal.client_name,
        expiresAt: portal.expires_at,
        requiresAccessCode: true,
      })
    }

    const ip = clientIp(request.headers)
    const rateKey = `download:${slug}:${ip}`
    const limited = checkRateLimit(rateKey, 10, 10 * 60 * 1000)
    if (!limited.ok) {
      return json(
        { error: 'Too many attempts. Try again shortly.' },
        429,
        { 'Retry-After': String(limited.retryAfter) }
      )
    }

    const isValid = await verifyPassword(password, portal.password_hash)
    if (!isValid) {
      return json({ error: 'Invalid access code' }, 401)
    }
    clearRateLimit(rateKey)
  }

  const attachments = listPortalFiles(portal)
  const files: Array<{
    id: string
    name: string
    fileName: string
    fileSize: number
    fileUrl: string
    previewUrl: string
    mimeType: string | null
  }> = []

  for (const f of attachments) {
    const fileName = f.name || getFileNameFromUrl(f.url)
    const [signedUrl, previewUrl] = await Promise.all([
      generateSignedUrl(f.url, 3600, fileName),
      generateSignedUrl(f.url, 3600),
    ])
    if (!signedUrl || !previewUrl) {
      return json({ error: 'Failed to generate secure download link' }, 500)
    }

    let fileSize = 0
    let mimeType: string | null = null
    try {
      const metadata = await getFileMetadata(f.url)
      if (metadata) {
        fileSize = metadata.size
        mimeType = metadata.mimeType
      }
    } catch {
      // keep 0
    }

    files.push({
      id: f.id,
      name: f.name,
      fileName,
      fileSize,
      fileUrl: signedUrl,
      previewUrl,
      mimeType,
    })
  }

  if (!files.length) {
    return json({ error: 'No files for this portal' }, 500)
  }

  await noteOpened(portal.id, slug, request)

  const primary = files[0]
  return json({
    clientName: portal.client_name,
    expiresAt: portal.expires_at,
    requiresAccessCode,
    files,
    fileName: primary.fileName,
    fileSize: primary.fileSize,
    fileUrl: primary.fileUrl,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    return await buildDownloadResponse(slug, request)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return json({ error: message }, 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const body = await request.json().catch(() => ({}))
    const password = typeof body.password === 'string' ? body.password : ''
    return await buildDownloadResponse(slug, request, password)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return json({ error: message }, 500)
  }
}
