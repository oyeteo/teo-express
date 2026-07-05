import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  adminSessionCookieOptions,
  createAdminSessionToken,
  getAdminSessionCookieName,
  verifyAdminPassword,
} from '@/lib/admin-session'
import { checkRateLimit, clearRateLimit, clientIp } from '@/lib/rate-limit'

const bodySchema = z.object({
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const ip = clientIp(request.headers)
    const rateKey = `admin-login:${ip}`
    const limited = checkRateLimit(rateKey, 8, 10 * 60 * 1000)
    if (!limited.ok) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again shortly.' },
        {
          status: 429,
          headers: { 'Retry-After': String(limited.retryAfter) },
        }
      )
    }

    const json = await request.json()
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    if (!verifyAdminPassword(parsed.data.password)) {
      return NextResponse.json({ error: 'That key did not turn' }, { status: 401 })
    }
    clearRateLimit(rateKey)

    let token: string
    try {
      token = createAdminSessionToken()
    } catch {
      return NextResponse.json(
        { error: 'Server missing TEO_ADMIN_SESSION_SECRET (16+ chars)' },
        { status: 500 }
      )
    }

    const res = NextResponse.json({ ok: true })
    res.cookies.set(getAdminSessionCookieName(), token, adminSessionCookieOptions())
    return res
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
