import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminSessionCookieName, verifyAdminSessionToken } from '@/lib/admin-session'

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  const token = jar.get(getAdminSessionCookieName())?.value
  if (!verifyAdminSessionToken(token)) {
    redirect('/admin/login')
  }
  return children
}
