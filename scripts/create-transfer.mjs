#!/usr/bin/env node

import { createReadStream, existsSync, readFileSync, statSync } from 'fs'
import { basename, extname, resolve } from 'path'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
import * as tus from 'tus-js-client'

const DEFAULT_DAYS = 14
const DEFAULT_PUBLIC_URL = 'https://x.teo.fm'
const OPEN_TRANSFER_PASSWORD_HASH = 'TEO_EXPRESS_OPEN_TRANSFER_V1'
const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 50 * 1024 * 1024
const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024
const WATCH_INTERVAL_MS = 15_000
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
const COMMANDS = new Set(['send', 'ls', 'status', 'watch', 'extend', 'rm', 'open'])

function usage() {
  return `teo-express: get a file into someone's hands and know it landed.

Usage:
  teo-express <file> [more files]        Upload, create the link, copy it to the clipboard
  teo-express ls                         Recent transfers with open/download counts
  teo-express status <slug-or-link>      Files, expiry, and who opened or downloaded
  teo-express watch <slug-or-link>       Wait until the first download lands, then notify
  teo-express extend <slug-or-link>      Push the expiry out (default +${DEFAULT_DAYS} days)
  teo-express rm <slug-or-link>          Delete the transfer and its files
  teo-express open <slug-or-link>        Open the download page in the browser

Send options:
  --name <text>       Name on the download page; defaults to the first file's name
  --to <emails>       Optional recipients, comma-separated or repeated; only a label
  --file <path>       File to upload; repeat for multiple files
  --code <text>       Optional access code for sensitive transfers
  --days <number>     Days until expiry; defaults to ${DEFAULT_DAYS}
  --expires <iso>     Exact expiration timestamp; overrides --days
  --no-copy           Do not copy the link to the clipboard
  --watch             After sending, keep waiting until the first download lands
  --dry-run           Validate input without uploading or creating a transfer

Other options:
  --days <number>     For extend: how many days to add
  --yes               For rm: skip the confirmation prompt

Environment:
  TEO_EXPRESS_PUBLIC_URL  Link base; defaults to ${DEFAULT_PUBLIC_URL}
  TEO_EXPRESS_ENV_FILE    Env file path; defaults to .env.local in the current directory or package root
`
}

function parseArgs(argv) {
  const out = { command: 'send', to: [], files: [], positional: [], dryRun: false, copy: true, watch: false, yes: false }
  const rest = [...argv]
  if (rest.length && COMMANDS.has(rest[0])) out.command = rest.shift()
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    const next = () => {
      i += 1
      if (i >= rest.length) throw new Error(`Missing value for ${arg}`)
      return rest[i]
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    } else if (arg === '--name') {
      out.name = next()
    } else if (arg === '--to') {
      out.to.push(...next().split(','))
    } else if (arg === '--file' || arg === '--files') {
      out.files.push(next())
    } else if (arg === '--code' || arg === '--password') {
      out.code = next()
    } else if (arg === '--days') {
      out.days = Number(next())
    } else if (arg === '--expires') {
      out.expires = next()
    } else if (arg === '--dry-run') {
      out.dryRun = true
    } else if (arg === '--no-copy') {
      out.copy = false
    } else if (arg === '--watch') {
      out.watch = true
    } else if (arg === '--yes' || arg === '-y') {
      out.yes = true
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option ${arg}`)
    } else if (out.command === 'send') {
      out.files.push(arg)
    } else {
      out.positional.push(arg)
    }
  }
  return out
}

function loadEnv() {
  const configuredPath = process.env.TEO_EXPRESS_ENV_FILE
  const candidates = [
    configuredPath ? resolve(process.cwd(), configuredPath) : null,
    resolve(process.cwd(), '.env.local'),
    resolve(PACKAGE_ROOT, '.env.local'),
  ].filter(Boolean)
  const envPath = [...new Set(candidates)].find((candidate) => existsSync(candidate))
  if (!envPath) return
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const eq = trimmed.indexOf('=')
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function normalizeRecipients(input) {
  return input.map((item) => item.trim()).filter(Boolean)
}

function validateEmailList(recipients) {
  return recipients.every((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
}

function defaultTransferName(files) {
  const first = basename(files[0])
  const stem = first.slice(0, first.length - extname(first).length) || first
  return stem.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Transfer'
}

function publicUrl() {
  return (process.env.TEO_EXPRESS_PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/$/, '')
}

function downloadLink(slug) {
  return `${publicUrl()}/download/${slug}`
}

function slugFromInput(input) {
  if (!input) throw new Error('Which transfer? Pass a slug or a download link')
  const trimmed = input.trim()
  const match = trimmed.match(/\/download\/([a-z0-9-]+)/)
  return match ? match[1] : trimmed.replace(/^\/+|\/+$/g, '')
}

function copyToClipboard(text) {
  if (process.platform !== 'darwin') return false
  const result = spawnSync('pbcopy', { input: text })
  return result.status === 0
}

function notify(title, message) {
  if (process.platform !== 'darwin') return
  const escape = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  spawnSync('osascript', ['-e', `display notification "${escape(message)}" with title "${escape(title)}" sound name "Glass"`])
}

function formatBytes(bytes) {
  if (!bytes) return 'size unknown'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function formatWhen(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const diffMs = date.getTime() - Date.now()
  const abs = Math.abs(diffMs)
  const minutes = Math.round(abs / 60_000)
  const hours = Math.round(abs / 3_600_000)
  const days = Math.round(abs / 86_400_000)
  let relative
  if (minutes < 1) relative = 'just now'
  else if (minutes < 60) relative = `${minutes} min`
  else if (hours < 48) relative = `${hours} h`
  else relative = `${days} days`
  if (relative !== 'just now') relative = diffMs < 0 ? `${relative} ago` : `in ${relative}`
  const local = date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return `${local} (${relative})`
}

function describeAgent(userAgent) {
  if (!userAgent) return 'unknown device'
  const ua = userAgent
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'unknown OS'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl|node|undici/i.test(ua)
              ? 'script'
              : 'browser'
  return `${browser} on ${os}`
}

function requireSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.SUPABASE_STORAGE_BUCKET
  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  if (!bucket) throw new Error('Missing SUPABASE_STORAGE_BUCKET')
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { supabase, supabaseUrl, serviceKey, bucket }
}

async function fetchTransfer(supabase, slug) {
  const { data, error } = await supabase.from('express_client_portals').select('*').eq('slug', slug).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`No transfer with slug "${slug}"`)
  return data
}

async function fetchEvents(supabase, portalId) {
  const { data, error } = await supabase
    .from('express_download_events')
    .select('kind, file_name, user_agent, created_at')
    .eq('portal_id', portalId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    if (error.code === '42P01') return []
    throw new Error(error.message)
  }
  return data || []
}

function summarizeEvents(events) {
  const opened = events.filter((event) => event.kind === 'opened')
  const downloaded = events.filter((event) => event.kind === 'downloaded')
  return { opened, downloaded, lastOpened: opened[0] || null, lastDownloaded: downloaded[0] || null }
}

function transferFiles(transfer) {
  const files = Array.isArray(transfer.files) ? transfer.files : []
  if (files.length) return files
  return transfer.file_url ? [{ id: 'primary', name: basename(transfer.file_url), url: transfer.file_url }] : []
}

function isExpired(transfer) {
  const expires = new Date(transfer.expires_at)
  return !Number.isNaN(expires.getTime()) && expires.getTime() < Date.now()
}

function storagePathFromRef(ref, bucket) {
  const prefix = `supabase://${bucket}/`
  return typeof ref === 'string' && ref.startsWith(prefix) ? ref.slice(prefix.length) : null
}

async function fetchFileSizes(supabase, bucket, files) {
  const sizes = new Map()
  for (const file of files) {
    const path = storagePathFromRef(file.url, bucket)
    if (!path) continue
    const folder = path.split('/').slice(0, -1).join('/')
    const name = path.split('/').pop()
    const { data } = await supabase.storage.from(bucket).list(folder, { search: name })
    const match = data?.find((item) => item.name === name)
    if (match?.metadata?.size) sizes.set(file.id, match.metadata.size)
  }
  return sizes
}

function printStatus(transfer, events, sizes) {
  const files = transferFiles(transfer)
  const { opened, downloaded, lastOpened, lastDownloaded } = summarizeEvents(events)
  const expired = isExpired(transfer)
  console.log(transfer.client_name)
  console.log(`Link: ${downloadLink(transfer.slug)}`)
  console.log(`${expired ? 'Expired' : 'Expires'}: ${formatWhen(transfer.expires_at)}`)
  console.log(`Access code: ${transfer.password_hash && transfer.password_hash !== OPEN_TRANSFER_PASSWORD_HASH ? 'required' : 'not required'}`)
  if (transfer.client_email) console.log(`Recipients: ${transfer.client_email}`)
  console.log(`Files: ${files.length}`)
  for (const file of files) {
    const count = downloaded.filter((event) => event.file_name === file.name).length
    const size = sizes?.get(file.id)
    console.log(`  ${file.name}  ${size ? formatBytes(size) : ''}${count ? `  downloaded ${count}x` : ''}`.replace(/\s+$/, ''))
  }
  if (!opened.length && !downloaded.length) {
    console.log('Nobody has opened this link yet')
    return
  }
  if (lastOpened) {
    console.log(`Opened ${opened.length}x, last ${formatWhen(lastOpened.created_at)} from ${describeAgent(lastOpened.user_agent)}`)
  }
  if (lastDownloaded) {
    console.log(
      `Downloaded ${downloaded.length}x, last ${lastDownloaded.file_name} ${formatWhen(lastDownloaded.created_at)} from ${describeAgent(lastDownloaded.user_agent)}`
    )
  } else {
    console.log('Not downloaded yet')
  }
}

async function waitForDownload(supabase, transfer, alreadySeen) {
  console.log(`Watching ${downloadLink(transfer.slug)} until the first download lands (Ctrl-C to stop)`)
  let seenOpened = alreadySeen
  for (;;) {
    if (isExpired(transfer)) {
      console.log('The transfer expired before anyone downloaded it')
      return false
    }
    const events = await fetchEvents(supabase, transfer.id)
    const { opened, downloaded } = summarizeEvents(events)
    if (downloaded.length) {
      const landed = downloaded[downloaded.length - 1]
      console.log(`Landed: ${landed.file_name} downloaded ${formatWhen(landed.created_at)} from ${describeAgent(landed.user_agent)}`)
      notify('TEO.EXPRESS', `${transfer.client_name}: ${landed.file_name} downloaded from ${describeAgent(landed.user_agent)}`)
      return true
    }
    if (opened.length > seenOpened) {
      const latest = opened[0]
      console.log(`Opened ${formatWhen(latest.created_at)} from ${describeAgent(latest.user_agent)}, no download yet`)
      notify('TEO.EXPRESS', `${transfer.client_name}: link opened from ${describeAgent(latest.user_agent)}`)
      seenOpened = opened.length
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, WATCH_INTERVAL_MS))
  }
}

function safeFileName(name) {
  const base = name.replace(/[/\\]/g, '').replace(/\.\./g, '').trim() || 'file'
  return base.replace(/[^\w.\-() ]/g, '_').slice(0, 200)
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function expiryIso(args) {
  if (args.expires) {
    const exact = new Date(args.expires)
    if (Number.isNaN(exact.getTime())) throw new Error('Invalid --expires timestamp')
    return exact.toISOString()
  }
  const days = args.days === undefined ? DEFAULT_DAYS : args.days
  if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number')
  const expires = new Date()
  expires.setUTCDate(expires.getUTCDate() + days)
  return expires.toISOString()
}

function storageObjectRef(bucket, storagePath) {
  return `supabase://${bucket}/${storagePath}`
}

function directStorageEndpoint(supabaseUrl) {
  const url = new URL(supabaseUrl)
  if (url.hostname.endsWith('.supabase.co')) {
    const [projectRef] = url.hostname.split('.')
    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
  }
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/upload/resumable`
}

function contentTypeFor(name) {
  const extension = name.split('.').pop().toLowerCase()
  const known = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    pdf: 'application/pdf',
    zip: 'application/zip',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
  }
  return known[extension] || 'application/octet-stream'
}

function printUploadProgress(name, bytesUploaded, bytesTotal, progress) {
  const percentage = bytesTotal > 0 ? (bytesUploaded / bytesTotal) * 100 : 0
  const nextStep = Math.floor(percentage / 5) * 5
  const now = Date.now()
  if (nextStep <= progress.lastStep && now - progress.lastLogAt < 30_000) return
  progress.lastStep = Math.max(progress.lastStep, nextStep)
  progress.lastLogAt = now
  console.log(
    `Uploading ${name}: ${percentage.toFixed(1)}% (${Math.round(bytesUploaded / 1024 / 1024)} MB / ${Math.round(
      bytesTotal / 1024 / 1024
    )} MB)`
  )
}

async function uploadFileStandard({ supabaseUrl, serviceKey, bucket, absolute, stat, name, storagePath }) {
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
  const uploadUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${encodedPath}`

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': contentTypeFor(name),
      'x-upsert': 'false',
    },
    body: createReadStream(absolute),
    duplex: 'half',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Upload failed for ${name}: ${response.status} ${body.slice(0, 180)}`)
  }
}

async function uploadFileResumable({ supabaseUrl, serviceKey, bucket, absolute, stat, name, storagePath }) {
  const progress = { lastStep: -5, lastLogAt: 0 }

  await new Promise((resolveUpload, rejectUpload) => {
    const upload = new tus.Upload(createReadStream(absolute), {
      endpoint: directStorageEndpoint(supabaseUrl),
      uploadSize: stat.size,
      chunkSize: TUS_CHUNK_SIZE_BYTES,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'x-upsert': 'false',
      },
      metadata: {
        bucketName: bucket,
        objectName: storagePath,
        contentType: contentTypeFor(name),
        cacheControl: '3600',
      },
      onProgress(bytesUploaded, bytesTotal) {
        printUploadProgress(name, bytesUploaded, bytesTotal, progress)
      },
      onError(error) {
        rejectUpload(error)
      },
      onSuccess() {
        printUploadProgress(name, stat.size, stat.size, progress)
        resolveUpload()
      },
    })

    upload.start()
  }).catch((error) => {
    throw new Error(`Upload failed for ${name}: ${error instanceof Error ? error.message : String(error)}`)
  })
}

async function uploadFile({ supabaseUrl, serviceKey, bucket, filePath }) {
  const absolute = resolve(process.cwd(), filePath)
  const stat = statSync(absolute)
  const name = safeFileName(basename(absolute))
  const storagePath = `transfers/${randomUUID()}/${name}`

  if (stat.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
    await uploadFileResumable({ supabaseUrl, serviceKey, bucket, absolute, stat, name, storagePath })
  } else {
    await uploadFileStandard({ supabaseUrl, serviceKey, bucket, absolute, stat, name, storagePath })
  }

  return {
    id: randomUUID(),
    name,
    url: storageObjectRef(bucket, storagePath),
    size: stat.size,
  }
}

async function insertTransfer({ supabase, name, recipients, files, code, expiresAt }) {
  const passwordHash = code ? await bcrypt.hash(code, 10) : OPEN_TRANSFER_PASSWORD_HASH
  const baseSlug = slugify(name)
  if (!baseSlug) throw new Error('Transfer name must contain letters or numbers')

  const payload = {
    client_name: name,
    client_email: recipients.join(', '),
    password_hash: passwordHash,
    file_url: files[0].url,
    files: files.map((file) => ({ id: file.id, name: file.name, url: file.url })),
    expires_at: expiresAt,
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`
    const { data, error } = await supabase
      .from('express_client_portals')
      .insert({ ...payload, slug })
      .select('id, slug')
      .single()

    if (!error && data) return data
    if (error?.code !== '23505') {
      throw new Error(error?.message || 'Could not create transfer')
    }
  }

  throw new Error('Could not find a unique slug')
}

async function send(args) {
  if (!args.files.length) throw new Error('Pass at least one file: teo-express ./file.zip')
  const files = args.files.map((item) => resolve(process.cwd(), item))
  for (const file of files) {
    if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`File not found: ${file}`)
  }
  const recipients = normalizeRecipients(args.to)
  if (!validateEmailList(recipients)) throw new Error('--to must contain valid emails')
  const name = args.name?.trim() || defaultTransferName(files)
  const expiresAt = expiryIso(args)

  if (args.dryRun) {
    console.log('Dry run OK')
    console.log(`Name: ${name}`)
    console.log(`Recipients: ${recipients.length ? recipients.join(', ') : 'none'}`)
    console.log(`Files: ${files.length}`)
    console.log(`Expires: ${expiresAt}`)
    console.log(`Protected: ${args.code ? 'yes' : 'no'}`)
    console.log(`Link base: ${publicUrl()}`)
    return
  }

  const { supabase, supabaseUrl, serviceKey, bucket } = requireSupabase()
  const uploaded = []
  for (const filePath of files) {
    console.log(`Uploading ${basename(filePath)}...`)
    uploaded.push(await uploadFile({ supabaseUrl, serviceKey, bucket, filePath }))
  }

  const transfer = await insertTransfer({ supabase, name, recipients, files: uploaded, code: args.code, expiresAt })
  const link = downloadLink(transfer.slug)
  const copied = args.copy && copyToClipboard(link)

  console.log('')
  console.log(link)
  console.log('')
  console.log(`${name}: ${uploaded.length} file${uploaded.length === 1 ? '' : 's'}, ${formatBytes(uploaded.reduce((sum, file) => sum + file.size, 0))}`)
  console.log(`Expires ${formatWhen(expiresAt)}`)
  if (args.code) console.log('Access code required')
  if (recipients.length) console.log(`Recipients: ${recipients.join(', ')}`)
  console.log(copied ? 'Link copied to the clipboard' : 'Copy the link above')
  console.log(`Check later: teo-express status ${transfer.slug}`)

  if (args.watch) {
    const full = await fetchTransfer(supabase, transfer.slug)
    await waitForDownload(supabase, full, 0)
  }
}

async function list() {
  const { supabase } = requireSupabase()
  const { data, error } = await supabase
    .from('express_client_portals')
    .select('id, slug, client_name, expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  if (!data?.length) {
    console.log('No transfers yet')
    return
  }
  const { data: events } = await supabase
    .from('express_download_events')
    .select('portal_id, kind')
    .in('portal_id', data.map((row) => row.id))
  const counts = new Map()
  for (const event of events || []) {
    const current = counts.get(event.portal_id) || { opened: 0, downloaded: 0 }
    current[event.kind] += 1
    counts.set(event.portal_id, current)
  }
  for (const row of data) {
    const count = counts.get(row.id) || { opened: 0, downloaded: 0 }
    const state = isExpired(row)
      ? 'expired'
      : count.downloaded
        ? `downloaded ${count.downloaded}x`
        : count.opened
          ? `opened ${count.opened}x, not downloaded`
          : 'not opened'
    console.log(`${row.slug.padEnd(44)} ${state.padEnd(30)} ${isExpired(row) ? '' : `expires ${formatWhen(row.expires_at)}`}`.trimEnd())
  }
}

async function status(args) {
  const slug = slugFromInput(args.positional[0])
  const { supabase, bucket } = requireSupabase()
  const transfer = await fetchTransfer(supabase, slug)
  const [events, sizes] = await Promise.all([
    fetchEvents(supabase, transfer.id),
    fetchFileSizes(supabase, bucket, transferFiles(transfer)),
  ])
  printStatus(transfer, events, sizes)
}

async function watch(args) {
  const slug = slugFromInput(args.positional[0])
  const { supabase } = requireSupabase()
  const transfer = await fetchTransfer(supabase, slug)
  const events = await fetchEvents(supabase, transfer.id)
  const { opened, downloaded } = summarizeEvents(events)
  if (downloaded.length) {
    console.log(`Already landed: ${downloaded[downloaded.length - 1].file_name} downloaded ${formatWhen(downloaded[downloaded.length - 1].created_at)}`)
    return
  }
  await waitForDownload(supabase, transfer, opened.length)
}

async function extend(args) {
  const slug = slugFromInput(args.positional[0])
  const days = args.days === undefined ? DEFAULT_DAYS : args.days
  if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number')
  const { supabase } = requireSupabase()
  const transfer = await fetchTransfer(supabase, slug)
  const base = isExpired(transfer) ? new Date() : new Date(transfer.expires_at)
  base.setUTCDate(base.getUTCDate() + days)
  const { error } = await supabase.from('express_client_portals').update({ expires_at: base.toISOString() }).eq('id', transfer.id)
  if (error) throw new Error(error.message)
  console.log(`${transfer.client_name} now expires ${formatWhen(base.toISOString())}`)
  console.log(downloadLink(transfer.slug))
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false
  const { createInterface } = await import('readline')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolveAnswer) => rl.question(question, resolveAnswer))
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

async function remove(args) {
  const slug = slugFromInput(args.positional[0])
  const { supabase, bucket } = requireSupabase()
  const transfer = await fetchTransfer(supabase, slug)
  const files = transferFiles(transfer)
  if (!args.yes) {
    const ok = await confirm(`Delete "${transfer.client_name}" (${files.length} file${files.length === 1 ? '' : 's'})? [y/N] `)
    if (!ok) {
      console.log('Kept')
      return
    }
  }
  const paths = files.map((file) => storagePathFromRef(file.url, bucket)).filter(Boolean)
  if (paths.length) {
    const { error } = await supabase.storage.from(bucket).remove(paths)
    if (error) throw new Error(`Could not delete files: ${error.message}`)
  }
  const { error } = await supabase.from('express_client_portals').delete().eq('id', transfer.id)
  if (error) throw new Error(error.message)
  console.log(`Deleted ${transfer.client_name}; ${downloadLink(transfer.slug)} is gone`)
}

function openInBrowser(args) {
  const slug = slugFromInput(args.positional[0])
  const link = downloadLink(slug)
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open'
  spawnSync(opener, [link], { stdio: 'ignore' })
  console.log(link)
}

async function main() {
  loadEnv()
  const args = parseArgs(process.argv.slice(2))
  if (args.command === 'send' && !args.files.length && !args.dryRun) {
    console.log(usage())
    process.exit(1)
  }
  switch (args.command) {
    case 'send':
      return send(args)
    case 'ls':
      return list()
    case 'status':
      return status(args)
    case 'watch':
      return watch(args)
    case 'extend':
      return extend(args)
    case 'rm':
      return remove(args)
    case 'open':
      return openInBrowser(args)
    default:
      throw new Error(`Unknown command ${args.command}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
