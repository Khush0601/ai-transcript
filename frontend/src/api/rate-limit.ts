import type { components } from './schema'

export type RateLimitStatus = components['schemas']['RateLimitStatus']

let snapshot: RateLimitStatus | null = null
const listeners = new Set<() => void>()

export function getRateLimitSnapshot(): RateLimitStatus | null {
  return snapshot
}

export function subscribeToRateLimit(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function publishRateLimitStatus(status: RateLimitStatus): void {
  snapshot = status
  for (const listener of listeners) listener()
}
