type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip') || 'local'
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now()
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }

  current.count += 1
  if (current.count <= limit) {
    return { ok: true }
  }

  return {
    ok: false,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  }
}

export function clearRateLimit(key: string): void {
  buckets.delete(key)
}
