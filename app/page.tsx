'use client'

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
        }}>
          Private File Sharing Platform
        </p>
      </div>
    </main>
  )
}

