import { NextRequest, NextResponse } from 'next/server'
import { getClientPortalBySlug, verifyPassword } from '@/lib/db'

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
        return 'file'
      }
    }

    // Fetch file size from URL headers
    let fileSize = 0
    try {
      const headResponse = await fetch(portal.file_url, { method: 'HEAD' })
      const contentLength = headResponse.headers.get('content-length')
      if (contentLength) {
        fileSize = parseInt(contentLength, 10)
      }
    } catch (error) {
      // If we can't fetch the size, fileSize will remain 0
      console.error('Error fetching file size:', error)
    }

    return NextResponse.json({
      clientName: portal.client_name,
      fileName: getFileNameFromUrl(portal.file_url),
      fileSize: fileSize,
      fileUrl: portal.file_url,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

