#!/usr/bin/env node

import { createReadStream, existsSync, readFileSync, statSync } from 'fs'
import { basename, resolve } from 'path'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_DAYS = 14
const OPEN_TRANSFER_PASSWORD_HASH = 'TEO_EXPRESS_OPEN_TRANSFER_V1'

function usage() {
  return `Usage:
  npm run transfer:create -- --name "Client delivery" --to client@example.com --file ./large.mov [--file ./notes.pdf]

Options:
  --name <text>       Transfer name shown on the download page
  --to <emails>       One or more recipient emails, comma-separated or repeated
  --file <path>       File to upload; repeat for multiple files
  --code <text>       Optional access code for sensitive transfers
  --days <number>     Days until expiry; defaults to ${DEFAULT_DAYS}
  --expires <iso>     Exact expiration timestamp; overrides --days
  --dry-run           Validate input without uploading or creating a transfer
`
}

function parseArgs(argv) {
  const out = { to: [], files: [], dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      i += 1
      if (i >= argv.length) throw new Error(`Missing value for ${arg}`)
      return argv[i]
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
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option ${arg}`)
    } else {
      out.files.push(arg)
    }
  }
  return out
}

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
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
  return recipients.length > 0 && recipients.every((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
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

async function uploadFile({ supabaseUrl, serviceKey, bucket, filePath }) {
  const absolute = resolve(process.cwd(), filePath)
  const stat = statSync(absolute)
  const name = safeFileName(basename(absolute))
  const storagePath = `transfers/${randomUUID()}/${name}`
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
  const uploadUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${encodedPath}`

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: createReadStream(absolute),
    duplex: 'half',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Upload failed for ${name}: ${response.status} ${body.slice(0, 180)}`)
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

async function main() {
  loadEnv()
  const args = parseArgs(process.argv.slice(2))
  const recipients = normalizeRecipients(args.to)
  const files = args.files.map((item) => resolve(process.cwd(), item))
  const expiresAt = expiryIso(args)

  if (!args.name?.trim()) throw new Error('--name is required')
  if (!validateEmailList(recipients)) throw new Error('--to must contain one or more valid emails')
  if (!files.length) throw new Error('At least one --file is required')
  for (const file of files) {
    if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`File not found: ${file}`)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.SUPABASE_STORAGE_BUCKET
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

  if (args.dryRun) {
    console.log('Dry run OK')
    console.log(`Name: ${args.name.trim()}`)
    console.log(`Recipients: ${recipients.join(', ')}`)
    console.log(`Files: ${files.length}`)
    console.log(`Expires: ${expiresAt}`)
    console.log(`Protected: ${args.code ? 'yes' : 'no'}`)
    return
  }

  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  if (!bucket) throw new Error('Missing SUPABASE_STORAGE_BUCKET')

  const uploaded = []
  for (const filePath of files) {
    console.log(`Uploading ${basename(filePath)}...`)
    uploaded.push(await uploadFile({ supabaseUrl, serviceKey, bucket, filePath }))
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const transfer = await insertTransfer({
    supabase,
    name: args.name.trim(),
    recipients,
    files: uploaded,
    code: args.code,
    expiresAt,
  })

  console.log('')
  console.log('Transfer ready')
  console.log(`Link: ${appUrl}/download/${transfer.slug}`)
  console.log(`Recipients: ${recipients.join(', ')}`)
  console.log(`Files: ${uploaded.length}`)
  console.log(`Expires: ${expiresAt}`)
  console.log(`Access code: ${args.code ? 'enabled' : 'not required'}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
