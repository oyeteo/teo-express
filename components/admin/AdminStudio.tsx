'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AdminPortalDto } from '@/lib/admin-portal-dto'
import type { PortalFile } from '@/lib/portal-model'

type Toast = { message: string; tone?: 'ok' | 'err' }

function shareBase(): string {
  if (typeof window === 'undefined') return ''
  const env = process.env.NEXT_PUBLIC_APP_URL
  if (env) return env.replace(/\/$/, '')
  return window.location.origin
}

function portalUrl(slug: string): string {
  return `${shareBase()}/download/${slug}`
}

async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) {
    window.location.href = '/admin/login'
    throw new Error('Session ended')
  }
  return res
}

function newFileId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

type Draft = {
  client_name: string
  client_email: string
  password: string
  slug: string
  expires_local: string
  files: PortalFile[]
}

function defaultExpiryLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function emptyDraft(): Draft {
  return {
    client_name: '',
    client_email: '',
    password: '',
    slug: '',
    expires_local: defaultExpiryLocal(),
    files: [],
  }
}

function portalToDraft(p: AdminPortalDto): Draft {
  return {
    client_name: p.client_name,
    client_email: p.client_email,
    password: '',
    slug: p.slug,
    expires_local: p.expires_at
      ? new Date(p.expires_at).toISOString().slice(0, 16)
      : '',
    files: p.files.map((f) => ({ ...f })),
  }
}

export function AdminStudio() {
  const [portals, setPortals] = useState<AdminPortalDto[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  const showToast = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const refresh = useCallback(async () => {
    const res = await adminFetch('/api/admin/portals')
    const data = (await res.json()) as { portals?: AdminPortalDto[] }
    setPortals(data.portals ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refresh()
      } catch {
        if (!cancelled) showToast('Could not load portals', 'err')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refresh, showToast])

  const selected = useMemo(
    () => portals.find((p) => p.id === selectedId) ?? null,
    [portals, selectedId]
  )

  useEffect(() => {
    if (creating) {
      setDraft(emptyDraft())
      return
    }
    if (selected) {
      setDraft(portalToDraft(selected))
    }
  }, [creating, selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return portals
    return portals.filter(
      (p) =>
        p.client_name.toLowerCase().includes(q) ||
        p.client_email.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q)
    )
  }, [portals, query])

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  const uploadFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList as File[])
    if (!arr.length) return
    setUploading(true)
    try {
      const next = [...draft.files]
      for (const file of arr) {
        const fd = new FormData()
        fd.set('file', file)
        const res = await adminFetch('/api/admin/upload', { method: 'POST', body: fd })
        const data = (await res.json()) as { url?: string; name?: string; error?: string }
        if (!res.ok) {
          showToast(data.error || 'Upload failed', 'err')
          continue
        }
        if (data.url) {
          next.push({
            id: newFileId(),
            url: data.url,
            name: data.name || file.name,
          })
        }
      }
      setDraft((d) => ({ ...d, files: next }))
      if (next.length > draft.files.length) {
        showToast('Pages added')
      }
    } finally {
      setUploading(false)
    }
  }

  const save = useCallback(async () => {
    if (saving || loading) return
    if (!draft.client_name.trim() || !draft.client_email.trim()) {
      showToast('Name and email are required', 'err')
      return
    }
    if (!draft.files.length) {
      showToast('Add at least one file', 'err')
      return
    }

    setSaving(true)
    try {
      if (creating) {
        if (draft.password.trim() && draft.password.trim().length < 4) {
          showToast('Access code: at least 4 characters', 'err')
          return
        }
        const body: Record<string, unknown> = {
          client_name: draft.client_name.trim(),
          client_email: draft.client_email.trim(),
          password: draft.password.trim(),
          files: draft.files,
        }
        if (draft.expires_local) {
          body.expires_at = new Date(draft.expires_local).toISOString()
        }
        const res = await adminFetch('/api/admin/portals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = (await res.json()) as { id?: string; slug?: string; error?: string }
        if (!res.ok) {
          showToast(data.error || 'Could not create', 'err')
          return
        }
        showToast('Transfer created')
        setCreating(false)
        await refresh()
        if (data.id) setSelectedId(data.id)
        return
      }

      if (!selected) return

      const patch: Record<string, unknown> = {
        client_name: draft.client_name.trim(),
        client_email: draft.client_email.trim(),
        slug: draft.slug.trim(),
        files: draft.files,
      }
      if (draft.password.trim()) {
        patch.new_password = draft.password.trim()
      }
      patch.expires_at = draft.expires_local
        ? new Date(draft.expires_local).toISOString()
        : null

      const res = await adminFetch(`/api/admin/portals/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        showToast(data.error || 'Could not save', 'err')
        return
      }
      showToast('Saved')
      await refresh()
    } finally {
      setSaving(false)
    }
  }, [
    creating,
    draft.client_email,
    draft.client_name,
    draft.expires_local,
    draft.files,
    draft.password,
    draft.slug,
    loading,
    saving,
    selected,
    refresh,
    showToast,
  ])

  const removePortal = async () => {
    if (!selected) return
    if (!window.confirm(`Remove transfer for “${selected.client_name}”? Files in storage will be deleted.`)) {
      return
    }
    const res = await adminFetch(`/api/admin/portals/${selected.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      showToast(data.error || 'Delete failed', 'err')
      return
    }
    showToast('Removed')
    setSelectedId(null)
    setCreating(false)
    await refresh()
  }

  const copyLink = async () => {
    const slug = creating ? draft.slug.trim() : selected?.slug
    if (!slug) {
      showToast('Save the transfer first to get a link', 'err')
      return
    }
    const url = portalUrl(slug)
    try {
      await navigator.clipboard.writeText(url)
      showToast('Link copied')
    } catch {
      showToast(url, 'ok')
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('admin-drop--active')
    if (e.dataTransfer.files?.length) {
      void uploadFiles(e.dataTransfer.files)
    }
  }

  const updateFileName = (id: string, name: string) => {
    setDraft((d) => ({
      ...d,
      files: d.files.map((f) => (f.id === id ? { ...f, name } : f)),
    }))
  }

  const removeFile = (id: string) => {
    setDraft((d) => ({ ...d, files: d.files.filter((f) => f.id !== id) }))
  }

  const selectRow = (id: string) => {
    setCreating(false)
    setSelectedId(id)
  }

  const startCreate = () => {
    setSelectedId(null)
    setCreating(true)
  }

  return (
    <div className="admin-studio">
      <header className="admin-studio__header">
        <div>
          <h1 className="admin-studio__title">Transfers</h1>
          <p className="admin-studio__subtitle">
            Add files, recipients, an optional access code, and share the link. Transfers expire automatically.
            <span className="admin-caret-line" aria-hidden />
          </p>
        </div>
        <div className="admin-studio__toolbar">
          <button type="button" className="admin-btn admin-btn--primary" onClick={startCreate}>
            New transfer
          </button>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      <div className="admin-grid">
        <aside className="admin-panel">
          <div className="admin-panel__head">
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>Transfers</span>
            <span className="admin-muted">{portals.length}</span>
          </div>
          <div className="admin-panel__body">
            <input
              className="admin-search"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search portals"
            />
            {loading ? (
              <p className="admin-muted">Opening the drawer…</p>
            ) : (
              <ul className="admin-portal-list">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={
                        'admin-portal-row' +
                        (!creating && selectedId === p.id ? ' admin-portal-row--active' : '')
                      }
                      onClick={() => selectRow(p.id)}
                    >
                      <div className="admin-portal-row__name">{p.client_name}</div>
                      <div className="admin-portal-row__meta">
                        /{p.slug} · {p.files.length} file{p.files.length === 1 ? '' : 's'}
                      </div>
                    </button>
                  </li>
                ))}
                {!filtered.length ? <li className="admin-muted">Nothing matches.</li> : null}
              </ul>
            )}
          </div>
        </aside>

        <section className="admin-panel">
          <div className="admin-panel__head">
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                {creating ? 'New transfer' : selected ? selected.client_name : 'Choose a transfer'}
            </span>
          </div>
          <div className="admin-panel__body">
            {!creating && !selected ? (
              <p className="admin-muted">Pick a transfer from the list, or create a new one.</p>
            ) : (
              <>
                <div className="admin-field">
                    <label htmlFor="client_name">Transfer name</label>
                  <input
                    id="client_name"
                    className="admin-input"
                    value={draft.client_name}
                    onChange={(e) => setDraft((d) => ({ ...d, client_name: e.target.value }))}
                    autoComplete="off"
                  />
                </div>
                <div className="admin-field">
                    <label htmlFor="client_email">Recipients</label>
                  <input
                    id="client_email"
                    className="admin-input"
                    type="email"
                    value={draft.client_email}
                    onChange={(e) => setDraft((d) => ({ ...d, client_email: e.target.value }))}
                    autoComplete="off"
                  />
                </div>

                {creating ? (
                  <div className="admin-field">
                    <label htmlFor="password">Access code (optional)</label>
                    <input
                      id="password"
                      className="admin-input"
                      type="password"
                      value={draft.password}
                      onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                      autoComplete="new-password"
                    />
                  </div>
                ) : (
                  <div className="admin-field">
                    <label htmlFor="new_password">New access code (optional)</label>
                    <input
                      id="new_password"
                      className="admin-input"
                      type="password"
                      value={draft.password}
                      onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                      autoComplete="new-password"
                      placeholder="Leave blank to keep current"
                    />
                  </div>
                )}

                <div className="admin-field">
                  <label htmlFor="slug">Link slug</label>
                  <input
                    id="slug"
                    className="admin-input"
                    value={draft.slug}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                      }))
                    }
                    readOnly={creating}
                    style={creating ? { opacity: 0.65 } : undefined}
                    title={creating ? 'Slug is set from the name when you save' : undefined}
                  />
                  {creating ? (
                    <p className="admin-muted" style={{ marginTop: '0.35rem' }}>
                      We will derive the URL from the client name when you save.
                    </p>
                  ) : null}
                </div>

                <div className="admin-field">
                  <label htmlFor="expires">Expires</label>
                  <input
                    id="expires"
                    className="admin-input"
                    type="datetime-local"
                    value={draft.expires_local}
                    onChange={(e) => setDraft((d) => ({ ...d, expires_local: e.target.value }))}
                  />
                </div>

                <div
                  className="admin-drop"
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.add('admin-drop--active')
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('admin-drop--active')
                  }}
                  onDrop={onDrop}
                >
                  Drop files here, or{' '}
                  <label style={{ textDecoration: 'underline', cursor: 'pointer' }}>
                    browse
                    <input
                      type="file"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files) void uploadFiles(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {uploading ? <span> — uploading…</span> : null}
                </div>

                <div className="admin-field">
                  <label>Attachments</label>
                  {draft.files.length === 0 ? (
                    <p className="admin-muted">No files yet.</p>
                  ) : (
                    draft.files.map((f) => (
                      <div key={f.id} className="admin-file-row">
                        <input
                          className="admin-input"
                          value={f.name}
                          onChange={(e) => updateFileName(f.id, e.target.value)}
                          aria-label="File label"
                        />
                        <button type="button" className="admin-btn admin-btn--danger" onClick={() => removeFile(f.id)}>
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="admin-actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary"
                    disabled={saving}
                    onClick={() => void save()}
                  >
                    {saving ? 'Saving…' : creating ? 'Create transfer' : 'Save changes'}
                  </button>
                  <button type="button" className="admin-btn" disabled={creating} onClick={() => void copyLink()}>
                    Copy link
                  </button>
                  {!creating && selected ? (
                    <button type="button" className="admin-btn admin-btn--danger" onClick={() => void removePortal()}>
                      Delete transfer
                    </button>
                  ) : null}
                </div>

                {!creating && selected ? (
                  <p className="admin-muted" style={{ marginTop: '1rem' }}>
                    Link: {portalUrl(selected.slug)}
                  </p>
                ) : null}

                <p className="admin-muted" style={{ marginTop: '0.75rem' }}>
                  Tip: ⌘S / Ctrl+S saves when editing.
                </p>
              </>
            )}
          </div>
        </section>
      </div>

      {toast ? (
        <div className="admin-toast" role="status">
          {toast.message}
        </div>
      ) : null}
    </div>
  )
}
