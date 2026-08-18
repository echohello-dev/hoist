export interface UsageWindow {
  label: string
  usedPercent: number
  resetsAt?: string
}

export interface UsageCredits {
  balance?: number
  limit?: number
  unlimited?: boolean
  currency?: string
}

export interface UsageResult {
  available: boolean
  plan?: string
  windows: UsageWindow[]
  credits?: UsageCredits
  detail?: string
  checkedAt: string
}

export function unavailable(detail: string, checkedAt = new Date().toISOString()): UsageResult {
  return { available: false, windows: [], detail, checkedAt }
}

export function normalizePercent(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const pct = v <= 1 ? v * 100 : v
  return Math.round(pct * 10) / 10
}

export function errorResult(err: unknown, timeoutMs: number, checkedAt: string): UsageResult {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('abort')) return unavailable(`Timed out after ${timeoutMs}ms.`, checkedAt)
  return unavailable(message, checkedAt)
}
