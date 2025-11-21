'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: 'linear-gradient(180deg, #FFFFFF 0%, #F5F5F5 100%)',
    }}>
      <div style={{
        textAlign: 'center',
        maxWidth: '600px',
        width: '100%',
      }}>
        <div style={{
          marginBottom: '2rem',
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
        <p style={{
          fontSize: '1.125rem',
          color: '#666',
          marginBottom: '3rem',
        }}>
          Private File Sharing Platform
        </p>
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          <Link
            href="/admin"
            style={{
              padding: '0.75rem 2rem',
              backgroundColor: '#ff0000',
              color: '#FFFFFF',
              borderRadius: '4px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              display: 'inline-block',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#cc0000'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ff0000'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            Admin Portal
          </Link>
        </div>
      </div>
    </main>
  )
}

