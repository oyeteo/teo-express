import { NextResponse } from 'next/server'
import { adminSessionCookieOptions, getAdminSessionCookieName } from '@/lib/admin-session'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(getAdminSessionCookieName(), '', { ...adminSessionCookieOptions(), maxAge: 0 })
  return res
}
