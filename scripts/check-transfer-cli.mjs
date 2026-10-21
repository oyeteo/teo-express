#!/usr/bin/env node

import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'

const dir = mkdtempSync(join(tmpdir(), 'teo-express-cli-'))
const sample = join(dir, 'mix_final-v2.wav')

function run(args, env = {}) {
  const result = spawnSync(process.execPath, ['scripts/create-transfer.mjs', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout)
    process.exit(result.status ?? 1)
  }
  return result.stdout
}

function expect(output, required) {
  for (const item of required) {
    if (!output.includes(item)) {
      process.stderr.write(`Missing expected output: ${item}\n${output}`)
      process.exit(1)
    }
  }
}

try {
  writeFileSync(sample, 'hello transfer\n', 'utf8')

  expect(
    run(['--dry-run', '--name', 'Client Review', '--to', 'one@example.com,two@example.com', '--file', sample, '--code', '1234', '--days', '3']),
    ['Dry run OK', 'Name: Client Review', 'Recipients: one@example.com, two@example.com', 'Files: 1', 'Protected: yes']
  )

  expect(run(['--dry-run', sample]), [
    'Dry run OK',
    'Name: mix final v2',
    'Recipients: none',
    'Files: 1',
    'Protected: no',
    'Link base: https://x.teo.fm',
  ])

  expect(run(['--dry-run', sample], { TEO_EXPRESS_PUBLIC_URL: 'http://localhost:3000/' }), ['Link base: http://localhost:3000'])

  const bad = spawnSync(process.execPath, ['scripts/create-transfer.mjs', '--dry-run', '--to', 'not-an-email', sample], { encoding: 'utf8' })
  if (bad.status === 0) {
    process.stderr.write('Expected invalid --to to fail\n')
    process.exit(1)
  }

  console.log('transfer CLI dry-run check passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
