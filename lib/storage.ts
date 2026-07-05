import { supabaseAdmin } from './supabase'

/**
 * Extracts bucket name and file path from a Supabase Storage URL
 * Supports both public and signed URL formats:
 * - https://project.supabase.co/storage/v1/object/public/bucket-name/path/to/file.pdf
 * - https://project.supabase.co/storage/v1/object/sign/bucket-name/path/to/file.pdf?token=...
 */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    if (url.startsWith('supabase://')) {
      const withoutScheme = url.slice('supabase://'.length)
      const slash = withoutScheme.indexOf('/')
      if (slash <= 0) return null
      const bucket = withoutScheme.slice(0, slash)
      const path = withoutScheme.slice(slash + 1)
      return bucket && path ? { bucket, path } : null
    }

    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    
    // Find the index of 'object' in the path
    const objectIndex = pathParts.findIndex(part => part === 'object')
    if (objectIndex === -1) {
      return null
    }
    
    // The bucket name comes after 'public' or 'sign'
    // Format: /storage/v1/object/public/bucket-name/path/to/file
    const accessTypeIndex = objectIndex + 1
    if (accessTypeIndex >= pathParts.length) {
      return null
    }
    
    const bucketIndex = accessTypeIndex + 1
    if (bucketIndex >= pathParts.length) {
      return null
    }
    
    const bucket = pathParts[bucketIndex]
    const path = pathParts.slice(bucketIndex + 1).join('/')
    
    return { bucket, path }
  } catch (error) {
    console.error('Error parsing storage URL:', error)
    return null
  }
}

export function storageObjectRef(bucket: string, path: string): string {
  return `supabase://${bucket}/${path}`
}

export function isPrivateStorageObjectRef(url: string, expectedBucket?: string): boolean {
  if (!url.startsWith('supabase://')) return false
  const parsed = parseStorageUrl(url)
  if (!parsed) return false
  if (expectedBucket && parsed.bucket !== expectedBucket) return false
  return !parsed.path.includes('..') && !parsed.path.startsWith('/')
}

/**
 * Generates a signed URL for a file in Supabase Storage
 * @param fileUrl The original file URL stored in the database
 * @param expiresIn Expiration time in seconds (default: 1 hour)
 * @returns Signed URL or null if generation fails
 */
export async function generateSignedUrl(
  fileUrl: string,
  expiresIn: number = 3600
): Promise<string | null> {
  try {
    const parsed = parseStorageUrl(fileUrl)
    if (!parsed) {
      console.error('Failed to parse storage URL:', fileUrl)
      return null
    }
    
    const { data, error } = await supabaseAdmin
      .storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, expiresIn)
    
    if (error) {
      console.error('Error creating signed URL:', error)
      return null
    }
    
    return data.signedUrl
  } catch (error) {
    console.error('Error generating signed URL:', error)
    return null
  }
}

/**
 * Gets file metadata (including size) from Supabase Storage
 */
export async function getFileMetadata(
  fileUrl: string
): Promise<{ size: number; mimeType: string | null } | null> {
  try {
    const parsed = parseStorageUrl(fileUrl)
    if (!parsed) {
      return null
    }
    
    const pathParts = parsed.path.split('/')
    const fileName = pathParts[pathParts.length - 1]
    const folderPath = pathParts.slice(0, -1).join('/')
    
    // List files in the folder to find the specific file
    const { data, error } = await supabaseAdmin
      .storage
      .from(parsed.bucket)
      .list(folderPath || '', {
        limit: 1000,
      })
    
    if (error) {
      console.error('Error listing files:', error)
      return null
    }
    
    if (!data) {
      return null
    }
    
    // Find the file by name
    const file = data.find(f => f.name === fileName)
    if (!file) {
      return null
    }
    
    return {
      size: file.metadata?.size || 0,
      mimeType: file.metadata?.mimetype || null,
    }
  } catch (error) {
    console.error('Error getting file metadata:', error)
    return null
  }
}

type BucketPaths = Map<string, string[]>

function groupPathsByBucket(urls: string[]): BucketPaths {
  const map: BucketPaths = new Map()
  for (const url of urls) {
    const parsed = parseStorageUrl(url)
    if (!parsed?.bucket || !parsed.path) continue
    const list = map.get(parsed.bucket) ?? []
    list.push(parsed.path)
    map.set(parsed.bucket, list)
  }
  return map
}

/** Removes objects from Supabase Storage; ignores per-path errors (idempotent cleanup). */
export async function removeStorageObjects(urls: string[]): Promise<void> {
  const grouped = groupPathsByBucket(urls)
  const entries = Array.from(grouped.entries())
  for (let i = 0; i < entries.length; i++) {
    const bucket = entries[i][0]
    const paths = entries[i][1]
    if (!paths.length) continue
    const { error } = await supabaseAdmin.storage.from(bucket).remove(paths)
    if (error) {
      console.error('Storage remove error', bucket, error.message)
    }
  }
}
