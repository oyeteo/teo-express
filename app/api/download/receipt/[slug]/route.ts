import { NextRequest, NextResponse } from 'next/server'
import { getClientPortalBySlug } from '@/lib/db'
import { listPortalFiles } from '@/lib/portal-model'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { recordTransferEvent } from '@/lib/transfer-events'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const ip = clientIp(request.headers)
  const limited = checkRateLimit(`receipt:${slug}:${ip}`, 60, 10 * 60 * 1000)
  if (!limited.ok) {
    return NextResponse.json({ ok: false }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } })
  }

  const portal = await getClientPortalBySlug(slug)
  if (!portal) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const fileId = typeof body?.fileId === 'string' ? body.fileId.slice(0, 80) : ''
  const file = listPortalFiles(portal).find((item) => item.id === fileId)
  if (!file) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  await recordTransferEvent({
    portalId: portal.id,
    kind: 'downloaded',
    fileId: file.id,
    fileName: file.name,
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
