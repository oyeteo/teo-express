'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    password: '',
    fileUrl: '',
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [createdSlug, setCreatedSlug] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setCreatedSlug(null)

    try {
      const response = await fetch('/api/admin/create-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: 'Client portal created successfully!' })
        setCreatedSlug(data.slug)
        setFormData({
          clientName: '',
          clientEmail: '',
          password: '',
          fileUrl: '',
        })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create portal' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const shareUrl = createdSlug ? `${window.location.origin}/download/${createdSlug}` : null

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
        maxWidth: '600px',
        width: '100%',
        backgroundColor: '#FFFFFF',
        padding: '3rem',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: '700',
          color: '#ff0000',
          marginBottom: '0.5rem',
        }}>
          Create Client Portal
        </h1>
        <p style={{
          color: '#666',
          marginBottom: '2rem',
        }}>
          Add a new client and generate a secure download link
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: '#ff0000',
              fontWeight: '600',
              fontSize: '0.875rem',
            }}>
              Client Name
            </label>
            <input
              type="text"
              required
              value={formData.clientName}
              onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #E0E0E0',
                borderRadius: '4px',
                fontSize: '1rem',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#ff0000'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#E0E0E0'}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: '#ff0000',
              fontWeight: '600',
              fontSize: '0.875rem',
            }}>
              Client Email
            </label>
            <input
              type="email"
              required
              value={formData.clientEmail}
              onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #E0E0E0',
                borderRadius: '4px',
                fontSize: '1rem',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#ff0000'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#E0E0E0'}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: '#ff0000',
              fontWeight: '600',
              fontSize: '0.875rem',
            }}>
              Password
            </label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #E0E0E0',
                borderRadius: '4px',
                fontSize: '1rem',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#ff0000'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#E0E0E0'}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: '#ff0000',
              fontWeight: '600',
              fontSize: '0.875rem',
            }}>
              Supabase File URL
            </label>
            <input
              type="url"
              required
              value={formData.fileUrl}
              onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
              placeholder="https://your-project.supabase.co/storage/v1/object/public/bucket-name/file.pdf"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #E0E0E0',
                borderRadius: '4px',
                fontSize: '1rem',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#ff0000'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#E0E0E0'}
            />
          </div>

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
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#6B1414'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#ff0000'
                e.currentTarget.style.transform = 'translateY(0)'
              }
            }}
          >
            {loading ? 'Creating...' : 'Create Portal'}
          </button>
        </form>

        {message && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            backgroundColor: message.type === 'success' ? '#E8F5E9' : '#FFEBEE',
            color: message.type === 'success' ? '#2E7D32' : '#C62828',
            borderRadius: '4px',
            fontSize: '0.875rem',
          }}>
            {message.text}
          </div>
        )}

        {shareUrl && (
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            backgroundColor: '#F5F5F5',
            borderRadius: '4px',
            border: '2px solid #ff0000',
          }}>
            <p style={{
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#ff0000',
              marginBottom: '0.5rem',
            }}>
              Share this link with your client:
            </p>
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
            }}>
              <input
                type="text"
                readOnly
                value={shareUrl}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: '1px solid #E0E0E0',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  backgroundColor: '#FFFFFF',
                }}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl)
                  setMessage({ type: 'success', text: 'Link copied to clipboard!' })
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#ff0000',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Copy
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <a
            href="/"
            style={{
              color: '#ff0000',
              textDecoration: 'underline',
              fontSize: '0.875rem',
            }}
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </main>
  )
}

