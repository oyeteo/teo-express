import { supabaseAdmin } from './supabase'
import bcrypt from 'bcryptjs'
import type { ClientPortalRow, PortalFile } from './portal-model'
import { listPortalFiles, primaryFileUrl } from './portal-model'

export type ClientPortal = ClientPortalRow

export const DEFAULT_TRANSFER_TTL_DAYS = 14
export const OPEN_TRANSFER_PASSWORD_HASH = 'TEO_EXPRESS_OPEN_TRANSFER_V1'

export function transferRequiresAccessCode(passwordHash: string | null | undefined): boolean {
  return Boolean(passwordHash && passwordHash !== OPEN_TRANSFER_PASSWORD_HASH)
}

export function defaultTransferExpiry(now: Date = new Date()): string {
  const expires = new Date(now.getTime())
  expires.setUTCDate(expires.getUTCDate() + DEFAULT_TRANSFER_TTL_DAYS)
  return expires.toISOString()
}

export function normalizeTransferRecipients(recipients: string[] | string): string {
  const items = Array.isArray(recipients) ? recipients : recipients.split(',')
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .join(', ')
}

export function isValidTransferRecipients(recipients: string[] | string): boolean {
  const normalized = normalizeTransferRecipients(recipients)
  if (!normalized) return false
  return normalized.split(',').every((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.trim()))
}

export function normalizeTransferSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
}

export function parseExpiryForDb(input?: string | null): string | null {
  if (!input) return defaultTransferExpiry()
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid expiration date')
  }
  return date.toISOString()
}

export async function createClientPortal(
  clientName: string,
  clientEmail: string,
  password: string | null | undefined,
  files: PortalFile[],
  expiresAt?: string | null
): Promise<{ slug: string; id: string; error?: string }> {
  if (!files.length) {
    return { slug: '', id: '', error: 'At least one file is required' }
  }

  const slug = generateSlug(clientName)
  if (!slug) {
    return { slug: '', id: '', error: 'Transfer name must contain letters or numbers' }
  }

  const passwordHash = password?.trim()
    ? await bcrypt.hash(password.trim(), 10)
    : OPEN_TRANSFER_PASSWORD_HASH
  const fileUrl = files[0].url
  const filesJson = files.map((f) => ({ id: f.id, url: f.url, name: f.name }))

  const insertPayload: Record<string, unknown> = {
    client_name: clientName,
    client_email: clientEmail,
    password_hash: passwordHash,
    file_url: fileUrl,
    slug,
    files: filesJson,
    expires_at: expiresAt === undefined ? defaultTransferExpiry() : expiresAt,
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('express_client_portals')
      .insert(insertPayload)
      .select('id, slug')
      .single()

    if (error) {
      if (error.code === '23505') {
        const uniqueSlug = await generateUniqueSlug(clientName)
        const { data: retryData, error: retryError } = await supabaseAdmin
          .from('express_client_portals')
          .insert({ ...insertPayload, slug: uniqueSlug })
          .select('id, slug')
          .single()

        if (retryError) {
          return { slug: '', id: '', error: retryError.message }
        }
        return { slug: retryData.slug, id: retryData.id }
      }
      return { slug: '', id: '', error: error.message }
    }

    return { slug: data.slug, id: data.id }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { slug: '', id: '', error: message }
  }
}

export async function listClientPortals(): Promise<ClientPortal[]> {
  const { data, error } = await supabaseAdmin
    .from('express_client_portals')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !data) {
    return []
  }
  return data as ClientPortal[]
}

export async function getClientPortalById(id: string): Promise<ClientPortal | null> {
  const { data, error } = await supabaseAdmin
    .from('express_client_portals')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data as ClientPortal
}

export async function getClientPortalBySlug(slug: string): Promise<ClientPortal | null> {
  const { data, error } = await supabaseAdmin
    .from('express_client_portals')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !data) {
    return null
  }

  return data as ClientPortal
}

export type PortalUpdateInput = {
  client_name?: string
  client_email?: string
  new_password?: string
  slug?: string
  expires_at?: string | null
  files?: PortalFile[]
}

export async function updateClientPortal(
  id: string,
  input: PortalUpdateInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getClientPortalById(id)
  if (!existing) {
    return { ok: false, error: 'Portal not found' }
  }

  const patch: Record<string, unknown> = {}

  if (input.client_name !== undefined) patch.client_name = input.client_name
  if (input.client_email !== undefined) patch.client_email = input.client_email
  if (input.expires_at !== undefined) patch.expires_at = input.expires_at

  if (input.new_password !== undefined && input.new_password.length > 0) {
    patch.password_hash = await bcrypt.hash(input.new_password, 10)
  }

  if (input.slug !== undefined && input.slug !== existing.slug) {
    const taken = await getClientPortalBySlug(input.slug)
    if (taken && taken.id !== id) {
      return { ok: false, error: 'That link slug is already in use' }
    }
    patch.slug = input.slug
  }

  if (input.files !== undefined) {
    if (!input.files.length) {
      return { ok: false, error: 'At least one file is required' }
    }
    patch.files = input.files.map((f) => ({ id: f.id, url: f.url, name: f.name }))
    patch.file_url = input.files[0].url
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true }
  }

  const { error } = await supabaseAdmin.from('express_client_portals').update(patch).eq('id', id)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Slug must be unique' }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

export async function deleteClientPortal(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getClientPortalById(id)
  if (!existing) {
    return { ok: false, error: 'Portal not found' }
  }

  const { error } = await supabaseAdmin.from('express_client_portals').delete().eq('id', id)

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true }
}

/** URLs for all attachments (for storage cleanup after delete or replace). */
export function collectPortalStorageUrls(portal: ClientPortal): string[] {
  const urls = new Set<string>()
  for (const f of listPortalFiles(portal)) {
    urls.add(f.url)
  }
  return Array.from(urls)
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash)
}

function generateSlug(name: string): string {
  return normalizeTransferSlug(name)
}

async function generateUniqueSlug(baseName: string): Promise<string> {
  const baseSlug = generateSlug(baseName)
  let counter = 1
  let slug = `${baseSlug}-${counter}`

  while (true) {
    const { data } = await supabaseAdmin
      .from('express_client_portals')
      .select('slug')
      .eq('slug', slug)
      .single()

    if (!data) {
      return slug
    }

    counter++
    slug = `${baseSlug}-${counter}`
  }
}

export { listPortalFiles, primaryFileUrl }
