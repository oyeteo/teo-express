#!/usr/bin/env node

import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { createHash, randomBytes } from 'crypto'

const publicUrl = (process.env.TEO_EXPRESS_PUBLIC_URL || 'https://x.teo.fm').replace(/\/$/, '')
const dir = mkdtempSync(join(tmpdir(), 'teo-express-roundtrip-'))
const fileName = `roundtrip-${Date.now()}.bin`
const sample = join(dir, fileName)
const payload = randomBytes(96 * 1024)
const expectedSha = createHash('sha256').update(payload).digest('hex')
const userAgent = 'teo-express-roundtrip-check'

function cli(args) {
  const result = spawnSync(process.execPath, ['scripts/create-transfer.mjs', ...args], {
    encoding: 'utf8',
    env: { ...process.env, TEO_EXPRESS_PUBLIC_URL: publicUrl },
  })
  if (result.status !== 0) throw new Error(`CLI failed: ${args.join(' ')}\n${result.stderr || result.stdout}`)
  return result.stdout
}

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

let slug = ''
try {
  writeFileSync(sample, payload)

  const sent = cli([sample, '--name', `Roundtrip check ${new Date().toISOString()}`, '--days', '1', '--no-copy'])
  const link = sent.match(/https?:\/\/\S+\/download\/([a-z0-9-]+)/)
  if (!link) fail(`no link in CLI output:\n${sent}`)
  slug = link[1]
  console.log(`1. sent: ${link[0]}`)

  const page = await fetch(link[0], { headers: { 'user-agent': userAgent } })
  if (!page.ok) fail(`download page returned ${page.status}`)
  console.log('2. download page renders')

  const verify = await fetch(`${publicUrl}/api/download/verify/${slug}`, { headers: { 'user-agent': userAgent } })
  const info = await verify.json()
  if (!verify.ok || !Array.isArray(info.files) || info.files.length !== 1) fail(`verify returned ${verify.status}: ${JSON.stringify(info)}`)
  if (info.files[0].fileName !== fileName) fail(`file name mismatch: ${info.files[0].fileName}`)
  if (info.files[0].fileSize !== payload.length) fail(`file size mismatch: ${info.files[0].fileSize}`)
  console.log('3. verify route lists the file with the right name and size')

  const download = await fetch(info.files[0].fileUrl)
  if (!download.ok) fail(`signed download returned ${download.status}`)
  const got = Buffer.from(await download.arrayBuffer())
  const gotSha = createHash('sha256').update(got).digest('hex')
  if (gotSha !== expectedSha) fail(`sha256 mismatch: ${gotSha} vs ${expectedSha}`)
  console.log('4. downloaded bytes match sha256')

  const receipt = await fetch(`${publicUrl}/api/download/receipt/${slug}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': userAgent },
    body: JSON.stringify({ fileId: info.files[0].id }),
  })
  if (!receipt.ok) fail(`receipt returned ${receipt.status}`)
  console.log('5. download receipt accepted')

  const status = cli(['status', slug])
  if (!/Opened \d+x/.test(status)) fail(`status does not show the open:\n${status}`)
  if (!/Downloaded 1x, last roundtrip-/.test(status)) fail(`status does not show the download:\n${status}`)
  console.log('6. status shows opened + downloaded')

  const listing = cli(['ls'])
  if (!listing.includes(slug)) fail(`ls does not include ${slug}`)
  console.log('7. ls includes the transfer')

  const extended = cli(['extend', slug, '--days', '2'])
  if (!extended.includes('now expires')) fail(`extend output unexpected:\n${extended}`)
  console.log('8. extend moved the expiry')

  console.log('roundtrip check passed')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  if (slug) {
    const removed = spawnSync(process.execPath, ['scripts/create-transfer.mjs', 'rm', slug, '--yes'], { encoding: 'utf8' })
    console.log(removed.status === 0 ? `9. cleaned up ${slug}` : `cleanup failed for ${slug}: ${removed.stderr}`)
    const gone = await fetch(`${publicUrl}/api/download/verify/${slug}`)
    if (gone.status !== 404) {
      console.error(`FAIL: deleted transfer still answers ${gone.status}`)
      process.exitCode = 1
    } else {
      console.log('10. deleted link now returns 404')
    }
  }
  rmSync(dir, { recursive: true, force: true })
}
