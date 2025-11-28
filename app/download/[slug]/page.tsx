'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'

interface FileInfo {
  clientName: string
  fileName: string
  fileSize: number
  fileUrl: string
}

export default function DownloadPage() {
  const params = useParams()
  const slug = params.slug as string
  const [password, setPassword] = useState('')
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/download/verify/${slug}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (response.ok) {
        setFileInfo(data)
        setAuthenticated(true)
      } else {
        setError(data.error || 'Invalid password')
      }
    } catch (error) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!fileInfo?.fileUrl) return

    setDownloading(true)
    setError(null)

    // Try to verify the URL is still valid by making a HEAD request
    try {
      const response = await fetch(fileInfo.fileUrl, { method: 'HEAD' })
      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
          // URL expired or unauthorized - need to re-authenticate
          setError('Download link has expired. Please enter your password again.')
          setAuthenticated(false)
          setFileInfo(null)
          setDownloading(false)
          return
        }
      }
    } catch (error) {
      // If check fails, still try to download (might be CORS issue)
      console.warn('Could not verify URL, attempting download anyway:', error)
    }

    // Create a temporary anchor element and trigger download
    // This approach avoids popup blockers and provides better UX
    try {
      const fileName = getFileNameFromUrl(fileInfo.fileUrl)
      const link = document.createElement('a')
      link.href = fileInfo.fileUrl
      link.download = fileName
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      
      // Append to body, click, then remove
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error initiating download:', error)
      setError('Failed to start download. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const getFileNameFromUrl = (url: string) => {
    try {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/')
      return pathParts[pathParts.length - 1] || 'file'
    } catch {
      return 'file'
    }
  }

  if (!authenticated) {
    return (
      <main style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        backgroundColor: '#FFFFFF',
      }}>
        <div style={{
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
        }}>
          <div style={{
            marginBottom: '3rem',
            display: 'flex',
            justifyContent: 'center',
          }}>
        <Image
          src="/teo-express-logo.png"
          alt="TEO.EXPRESS Logo"
          width={552}
          height={336}
          style={{ objectFit: 'contain', maxWidth: '50%', height: 'auto' }}
          priority
        />
          </div>

          <form onSubmit={handlePasswordSubmit} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              style={{
                padding: '0.875rem',
                border: '2px solid #ff0000',
                borderRadius: '4px',
                fontSize: '1rem',
                textAlign: 'center',
                fontFamily: 'monospace',
                letterSpacing: '0.1em',
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.875rem 2rem',
                backgroundColor: loading ? '#CCCCCC' : '#ff0000',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {loading ? 'Verifying...' : 'Access'}
            </button>
          </form>

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: '#FFEBEE',
              color: '#C62828',
              borderRadius: '4px',
              fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}
        </div>
      </main>
    )
  }

  const fileName = fileInfo ? getFileNameFromUrl(fileInfo.fileUrl) : 'file'

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      backgroundColor: '#FFFFFF',
      position: 'relative',
    }}>
      {/* Logo centered */}
      <div style={{
        marginBottom: '4rem',
        display: 'flex',
        justifyContent: 'center',
      }}>
        <Image
          src="/teo-express-logo.png"
          alt="TEO.EXPRESS Logo"
          width={552}
          height={336}
          style={{ objectFit: 'contain', maxWidth: '25%', height: 'auto' }}
          priority
        />
      </div>

      {/* HUD Style File Info */}
      <div style={{
        fontFamily: "'Courier New', 'Monaco', 'Consolas', monospace",
        fontSize: '0.875rem',
        color: '#ff0000',
        textAlign: 'center',
        marginBottom: '3rem',
        lineHeight: '2',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        <div style={{
          border: '2px solid #ff0000',
          padding: '2rem',
          backgroundColor: '#Fff',
          borderRadius: '4px',
          minWidth: '400px',
          maxWidth: '600px',
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ color: '#000', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
              CLIENT
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>
              {fileInfo?.clientName || 'N/A'}
            </div>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ color: '#000', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
              FILE NAME
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>
              {fileName}
            </div>
          </div>

          <div style={{
            marginTop: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid #ff0000',
          }}>
            <div style={{ color: '#666', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
              STATUS
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#000' }}>
              READY FOR DOWNLOAD
            </div>
          </div>
        </div>
      </div>

      {/* Download Button */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        style={{
          padding: '1rem 3rem',
          backgroundColor: downloading ? '#CCCCCC' : '#ff0000',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: '4px',
          fontSize: '1.125rem',
          fontWeight: '700',
          cursor: downloading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontFamily: "'Courier New', 'Monaco', 'Consolas', monospace",
          opacity: downloading ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (!downloading) {
            e.currentTarget.style.backgroundColor = '#cc0000'
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 0, 0, 0.3)'
          }
        }}
        onMouseLeave={(e) => {
          if (!downloading) {
            e.currentTarget.style.backgroundColor = '#ff0000'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }
        }}
      >
        {downloading ? 'Downloading...' : 'Download File'}
      </button>
    </main>
  )
}

