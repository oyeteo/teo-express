#!/usr/bin/env node

import { readFileSync } from 'fs'

const checks = [
  {
    file: 'app/api/admin/portals/route.ts',
    mustInclude: ['isPrivateStorageObjectRef', 'storageBucket()'],
    mustNotInclude: ['url: z.string().url()'],
  },
  {
    file: 'app/api/admin/portals/[id]/route.ts',
    mustInclude: ['isPrivateStorageObjectRef', 'storageBucket()'],
    mustNotInclude: ['url: z.string().url()'],
  },
  {
    file: 'app/api/download/verify/[slug]/route.ts',
    mustInclude: ['Retry-After', 'Cache-Control', 'no-store', 'checkRateLimit'],
    mustNotInclude: [],
  },
  {
    file: 'supabase-schema.sql',
    mustInclude: ['REVOKE ALL ON TABLE express_client_portals FROM anon', 'FOR ALL TO service_role'],
    mustNotInclude: ['Service role can do everything'],
  },
  {
    file: 'supabase-migration-portal-files.sql',
    mustInclude: ['DROP POLICY IF EXISTS "Service role can do everything"', 'FOR ALL TO service_role'],
    mustNotInclude: [],
  },
]

for (const check of checks) {
  const text = readFileSync(check.file, 'utf8')
  for (const item of check.mustInclude) {
    if (!text.includes(item)) {
      throw new Error(`${check.file} missing required text: ${item}`)
    }
  }
  for (const item of check.mustNotInclude) {
    if (text.includes(item)) {
      throw new Error(`${check.file} still contains forbidden text: ${item}`)
    }
  }
}

console.log('security static checks passed')
