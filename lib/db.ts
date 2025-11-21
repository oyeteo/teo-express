import { supabaseAdmin } from './supabase'
import bcrypt from 'bcryptjs'

export interface ClientPortal {
  id: string
  client_name: string
  client_email: string
  password_hash: string
  file_url: string
  slug: string
  created_at: string
  expires_at?: string
}

export async function createClientPortal(
  clientName: string,
  clientEmail: string,
  password: string,
  fileUrl: string
): Promise<{ slug: string; error?: string }> {
  try {
    // Generate a friendly slug from client name
    const slug = generateSlug(clientName)
    
    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10)
    
    // Insert into database
    const { data, error } = await supabaseAdmin
      .from('express_client_portals')
      .insert({
        client_name: clientName,
        client_email: clientEmail,
        password_hash: passwordHash,
        file_url: fileUrl,
        slug: slug,
      })
      .select()
      .single()

    if (error) {
      // If slug already exists, append a number
      if (error.code === '23505') {
        const uniqueSlug = await generateUniqueSlug(clientName)
        const { data: retryData, error: retryError } = await supabaseAdmin
          .from('express_client_portals')
          .insert({
            client_name: clientName,
            client_email: clientEmail,
            password_hash: passwordHash,
            file_url: fileUrl,
            slug: uniqueSlug,
          })
          .select()
          .single()
        
        if (retryError) {
          return { slug: '', error: retryError.message }
        }
        return { slug: retryData.slug }
      }
      return { slug: '', error: error.message }
    }

    return { slug: data.slug }
  } catch (error: any) {
    return { slug: '', error: error.message }
  }
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

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash)
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
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

