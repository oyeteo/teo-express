import { NextRequest, NextResponse } from 'next/server'
import { createClientPortal } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientName, clientEmail, password, fileUrl } = body

    if (!clientName || !clientEmail || !password || !fileUrl) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    const result = await createClientPortal(
      clientName,
      clientEmail,
      password,
      fileUrl
    )

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({ slug: result.slug })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

