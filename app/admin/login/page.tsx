'use client'

import { useState } from 'react'

export default function AdminLoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error || 'Could not sign in')
        return
      }
      window.location.href = '/admin'
    } catch {
      setError('Something went wrong')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <h1>Return to the desk</h1>
        <p>Enter the admin password to open the client post room.</p>
        {error ? <div className="admin-login__error">{error}</div> : null}
        <form onSubmit={submit}>
          <div className="admin-field">
            <label htmlFor="admin_pw">Password</label>
            <input
              id="admin_pw"
              className="admin-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="admin-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
              {pending ? 'Opening…' : 'Enter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
