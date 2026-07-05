/**
 * Shared portal + file shape for DB rows, API responses, and client download UI.
 */

export type PortalFile = {
  id: string
  url: string
  name: string
}

export type ClientPortalRow = {
  id: string
  client_name: string
  client_email: string
  password_hash: string
  file_url: string
  slug: string
  created_at: string
  expires_at?: string | null
  /** When null or empty, legacy single-file portals use `file_url` only. */
  files?: PortalFile[] | null
}

function fileNameFromUrl(url: string): string {
  try {
    const pathParts = new URL(url).pathname.split('/')
    return pathParts[pathParts.length - 1] || 'file'
  } catch {
    return 'file'
  }
}

function stableIdFromStrings(parts: string): string {
  let h = 5381
  for (let i = 0; i < parts.length; i++) h = ((h << 5) + h) ^ parts.charCodeAt(i)
  return (h >>> 0).toString(36)
}

function normalizePortalFile(raw: unknown, index: number): PortalFile | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const url = typeof o.url === 'string' ? o.url : ''
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : fileNameFromUrl(url)
  const id =
    typeof o.id === 'string' && o.id
      ? o.id
      : `f-${index}-${stableIdFromStrings(url + '\0' + name)}`
  if (!url) return null
  return { id, url, name }
}

/** Files exposed to clients and admin; always non-empty for a valid portal. */
export function listPortalFiles(portal: Pick<ClientPortalRow, 'file_url' | 'files'>): PortalFile[] {
  const parsed: PortalFile[] = []
  if (Array.isArray(portal.files)) {
    portal.files.forEach((item, index) => {
      const f = normalizePortalFile(item, index)
      if (f) parsed.push(f)
    })
  }
  if (parsed.length > 0) return parsed
  return [
    {
      id: 'legacy',
      url: portal.file_url,
      name: fileNameFromUrl(portal.file_url),
    },
  ]
}

export function primaryFileUrl(portal: Pick<ClientPortalRow, 'file_url' | 'files'>): string {
  const files = listPortalFiles(portal)
  return files[0]?.url ?? portal.file_url
}
