#!/usr/bin/env node

import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'

const dir = mkdtempSync(join(tmpdir(), 'teo-express-cli-'))
const sample = join(dir, 'sample.txt')

try {
  writeFileSync(sample, 'hello transfer\n', 'utf8')
  const result = spawnSync(
    process.execPath,
    [
      'scripts/create-transfer.mjs',
      '--dry-run',
      '--name',
      'Client Review',
      '--to',
      'one@example.com,two@example.com',
      '--file',
      sample,
      '--code',
      '1234',
      '--days',
      '3',
    ],
    { encoding: 'utf8' }
  )

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout)
    process.exit(result.status ?? 1)
  }

  const output = result.stdout
  const required = [
    'Dry run OK',
    'Recipients: one@example.com, two@example.com',
    'Files: 1',
    'Protected: yes',
  ]
  for (const item of required) {
    if (!output.includes(item)) {
      process.stderr.write(`Missing expected output: ${item}\n${output}`)
      process.exit(1)
    }
  }

  console.log('transfer CLI dry-run check passed')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
