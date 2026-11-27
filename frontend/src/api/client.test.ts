import { afterEach, expect, it, vi } from 'vitest'

import { listTranscriptions, requestSttToken } from './client'
import { getRateLimitSnapshot, publishRateLimitStatus } from './rate-limit'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('preserves the current quota when a read response has no quota headers', async () => {
  const currentQuota = {
    limit: 10,
    remaining: 7,
    resets_at: '2026-11-27T13:00:00Z',
  }
  publishRateLimitStatus(currentQuota)
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ items: [], total: 0, page: 1, limit: 10 }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
  )

  await listTranscriptions({ search: '', page: 1, limit: 10 })

  expect(getRateLimitSnapshot()).toEqual(currentQuota)
})

it('updates the displayed quota from sensitive response headers', async () => {
  const resetTimestamp = Math.ceil(Date.now() / 1000) + 3600
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': '6',
          'X-RateLimit-Reset': String(resetTimestamp),
        },
      }),
    ),
  )

  await requestSttToken('auto')

  expect(getRateLimitSnapshot()).toEqual({
    limit: 10,
    remaining: 6,
    resets_at: new Date(resetTimestamp * 1000).toISOString(),
  })
})
