import { NextRequest, NextResponse } from 'next/server'
import { getClientPortalBySlug, verifyPassword } from '@/lib/db'
import { generateSignedUrl, getFileMetadata, parseStorageUrl } from '@/lib/storage'

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug
    const body = await request.json()
    const { password } = body

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      )
    }

    const portal = await getClientPortalBySlug(slug)

    if (!portal) {
      return NextResponse.json(
        { error: 'Invalid download link' },
        { status: 404 }
      )
    }

    // Check if portal has expired
    if (portal.expires_at) {
      const expiresAt = new Date(portal.expires_at)
      if (expiresAt < new Date()) {
        return NextResponse.json(
          { error: 'This download link has expired' },
          { status: 410 }
        )
      }
    }

    const isValid = await verifyPassword(password, portal.password_hash)

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      )
    }

    // Extract filename from URL
    const getFileNameFromUrl = (url: string) => {
      try {
        const urlObj = new URL(url)
        const pathParts = urlObj.pathname.split('/')
        return pathParts[pathParts.length - 1] || 'file'
      } catch {
        const parsed = parseStorageUrl(url)
        if (parsed) {
          return parsed.path.split('/').pop() || 'file'
        }
        return 'file'
      }
    }

    // Generate a signed URL (valid for 1 hour)
    const signedUrl = await generateSignedUrl(portal.file_url, 3600)
    
    if (!signedUrl) {
      return NextResponse.json(
        { error: 'Failed to generate secure download link' },
        { status: 500 }
      )
    }

    // Get file metadata (size) from Supabase Storage
    let fileSize = 0
    try {
      const metadata = await getFileMetadata(portal.file_url)
      if (metadata) {
        fileSize = metadata.size
      }
    } catch (error) {
      // If we can't get metadata, fileSize will remain 0
      console.error('Error getting file metadata:', error)
    }

    return NextResponse.json({
      clientName: portal.client_name,
      fileName: getFileNameFromUrl(portal.file_url),
      fileSize: fileSize,
      fileUrl: signedUrl, // Return signed URL instead of public URL
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

