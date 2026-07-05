'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'

type DownloadFile = {
  id: string
  name: string
  fileName: string
  fileSize: number
  fileUrl: string
}

type TransferResponse = {
  clientName?: string
  expiresAt?: string | null
  requiresAccessCode?: boolean
  files?: DownloadFile[]
  error?: string
}

function formatBytes(bytes: number): string {
  if (!bytes) return 'Size pending'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function formatExpiry(value?: string | null): string {
  if (!value) return 'Expires automatically'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Expires automatically'
  return `Expires ${date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

export default function DownloadPage() {
  const params = useParams()
  const slug = params.slug as string
  const [accessCode, setAccessCode] = useState('')
  const [clientName, setClientName] = useState<string>('Transfer')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [files, setFiles] = useState<DownloadFile[]>([])
  const [requiresAccessCode, setRequiresAccessCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingCode, setCheckingCode] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const fileCountLabel = useMemo(() => {
    if (error && files.length === 0) return 'Unavailable'
    if (!files.length) return requiresAccessCode ? 'Locked' : 'Checking'
    return `${files.length} file${files.length === 1 ? '' : 's'}`
  }, [error, files.length, requiresAccessCode])

  const expiryLabel = error?.toLowerCase().includes('expired') ? 'Expired' : formatExpiry(expiresAt)

  const applyResponse = (data: TransferResponse) => {
    setClientName(data.clientName || 'Transfer')
    setExpiresAt(data.expiresAt ?? null)
    setRequiresAccessCode(Boolean(data.requiresAccessCode))
    setFiles(Array.isArray(data.files) ? data.files : [])
  }

  const loadTransfer = useCallback(async (password?: string): Promise<boolean> => {
    const response = await fetch(`/api/download/verify/${slug}`, {
      method: password ? 'POST' : 'GET',
      headers: password ? { 'Content-Type': 'application/json' } : undefined,
      body: password ? JSON.stringify({ password }) : undefined,
      cache: 'no-store',
    })
    const data = (await response.json()) as TransferResponse
    if (!response.ok) {
      setError(data.error || 'This transfer is unavailable.')
      return false
    }
    applyResponse(data)
    return true
  }, [slug])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        if (cancelled) return
        await loadTransfer()
      } catch {
        if (!cancelled) setError('Could not open this transfer. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadTransfer])

  const unlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCheckingCode(true)
    setError(null)

    try {
      await loadTransfer(accessCode)
    } catch {
      setError('Could not verify the access code. Please try again.')
    } finally {
      setCheckingCode(false)
    }
  }

  const triggerDownload = async (file: DownloadFile) => {
    setDownloadingId(file.id)
    setError(null)

    try {
      const response = await fetch(file.fileUrl, { method: 'HEAD' })
      if (response.status === 401 || response.status === 403) {
        const refreshed = await loadTransfer(requiresAccessCode ? accessCode : undefined)
        setError(
          refreshed
            ? 'Secure links refreshed. Select Download again.'
            : 'This signed download expired. Refresh the page or ask the sender for a new transfer.'
        )
        setDownloadingId(null)
        return
      }
    } catch {
      // Some storage providers block HEAD from browsers; the link click below is still valid.
    }

    const link = document.createElement('a')
    link.href = file.fileUrl
    link.download = file.fileName
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setDownloadingId(null)
  }

  const locked = requiresAccessCode && files.length === 0
  const unavailable = Boolean(error && files.length === 0 && !locked)
  const title = loading
    ? 'Opening transfer'
    : unavailable
      ? 'Transfer unavailable'
      : locked
        ? 'Access code required'
        : 'Your files are ready'
  const copy = unavailable
    ? 'This link cannot prepare downloads. Check with the sender for a fresh transfer.'
    : locked
      ? 'Enter the code from the sender to prepare secure download links.'
      : `Secure download prepared for ${clientName}.`

  return (
    <main className="transfer-page">
      <section className="transfer-shell" aria-labelledby="transfer-title">
        <header className="transfer-header">
          <div className="transfer-brand">
            <Image
              src="/teo-fm-lcd.png"
              alt="Teo"
              width={64}
              height={64}
              className="transfer-brand__mark"
              priority
            />
            <div>
              <div className="transfer-brand__name">TEO.EXPRESS</div>
              <div className="transfer-brand__meta">PRIVATE TRANSFER</div>
            </div>
          </div>
          <div className="transfer-status" aria-label={`Transfer status: ${error ? 'attention' : locked ? 'locked' : 'ready'}`}>
            STATUS: [{error ? 'ATTN' : locked ? 'LOCKED' : 'READY'}]
          </div>
        </header>

        <div className="transfer-panel">
          <div className="transfer-panel__topline">
            <span>{fileCountLabel}</span>
            <span>{expiryLabel}</span>
          </div>

          <h1 id="transfer-title" className="transfer-title">
            {title}
          </h1>
          <p className="transfer-copy">{copy}</p>

          {error ? (
            <div className="transfer-alert" role="alert">
              {error}
            </div>
          ) : null}

          {locked ? (
            <form className="transfer-form" onSubmit={unlock}>
              <label className="transfer-label" htmlFor="access-code">
                Access code
              </label>
              <div className="transfer-unlock">
                <input
                  id="access-code"
                  className="transfer-input"
                  type="password"
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value)}
                  autoComplete="one-time-code"
                  autoFocus
                  required
                />
                <button className="transfer-button" type="submit" disabled={checkingCode}>
                  {checkingCode ? 'Checking' : 'Open'}
                </button>
              </div>
            </form>
          ) : null}

          {!locked && !loading ? (
            <ul className="transfer-files" aria-label="Files available for download">
              {files.map((file) => (
                <li className="transfer-file" key={file.id}>
                  <div className="transfer-file__main">
                    <span className="transfer-file__name">{file.fileName}</span>
                    <span className="transfer-file__size">{formatBytes(file.fileSize)}</span>
                  </div>
                  <button
                    className="transfer-button transfer-button--compact"
                    type="button"
                    onClick={() => void triggerDownload(file)}
                    disabled={downloadingId === file.id}
                  >
                    {downloadingId === file.id ? 'Starting' : 'Download'}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {loading ? <div className="transfer-loading">Preparing secure links...</div> : null}
        </div>
      </section>
    </main>
  )
}
