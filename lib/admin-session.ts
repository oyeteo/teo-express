import { createHmac, timingSafeEqual, createHash } from 'crypto'

const COOKIE_NAME = 'teo_admin_sess'
const MAX_AGE_SEC = 60 * 60 * 24 * 7

export function getAdminSessionCookieName(): string {
  return COOKIE_NAME
}

function sessionSecret(): string {
  const s = process.env.TEO_ADMIN_SESSION_SECRET
  if (!s || s.length < 16) {
    throw new Error('TEO_ADMIN_SESSION_SECRET must be set (min 16 characters)')
  }
  return s
}

export function createAdminSessionToken(): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC
  const payload = Buffer.from(JSON.stringify({ exp }), 'utf8').toString('base64url')
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyAdminSessionToken(token: string | undefined): boolean {
  if (!token || !token.includes('.')) return false
  const dot = token.indexOf('.')
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!payload || !sig) return false

  let secret: string
  try {
    secret = sessionSecret()
  } catch {
    return false
  }

  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  if (!timingSafeEqual(a, b)) return false

  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number }
    if (typeof body.exp !== 'number') return false
    return body.exp >= Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.TEO_ADMIN_PASSWORD
  if (!expected) return false
  const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest()
  try {
    return timingSafeEqual(hash(password), hash(expected))
  } catch {
    return false
  }
}

export function adminSessionCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE_SEC,
  }
}
