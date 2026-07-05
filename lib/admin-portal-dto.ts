import type { ClientPortal } from './db'
import { listPortalFiles } from './portal-model'

export type AdminPortalDto = {
  id: string
  client_name: string
  client_email: string
  slug: string
  created_at: string
  expires_at?: string | null
  files: ReturnType<typeof listPortalFiles>
}

export function toAdminPortalDto(row: ClientPortal): AdminPortalDto {
  return {
    id: row.id,
    client_name: row.client_name,
    client_email: row.client_email,
    slug: row.slug,
    created_at: row.created_at,
    expires_at: row.expires_at,
    files: listPortalFiles(row),
  }
}
