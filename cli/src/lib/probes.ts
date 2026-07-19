import type { ProviderEntry } from './providers'

const ANTHROPIC_VERSION = '2023-06-01'
const TIMEOUT_MS = 5000

export interface ProbeResult {
  valid: boolean
  status: 'ok' | 'invalid' | 'expired' | 'quota_exceeded' | 'error'
  detail?: string
  checkedAt: string
}

export async function probeProvider(provider: ProviderEntry, apiKey: string, baseUrl?: string): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString()
  if (!apiKey) {
    return { valid: false, status: 'invalid', detail: 'No API key supplied.', checkedAt }
  }
  if (provider.id === 'anthropic') {
    return probeAnthropic({ apiKey, baseUrl: baseUrl ?? provider.defaultBaseUrl ?? 'https://api.anthropic.com' })
  }
  return { valid: false, status: 'error', detail: `No probe implemented for "${provider.id}".`, checkedAt }
}

export async function probeAnthropic({ apiKey, baseUrl }: { apiKey: string; baseUrl: string }): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/v1/models?limit=1`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      signal: controller.signal,
    })
    if (res.ok) return { valid: true, status: 'ok', detail: 'Key validated against /v1/models.', checkedAt }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, status: 'invalid', detail: `Authentication failed (${res.status}).`, checkedAt }
    }
    if (res.status === 429) {
      const retry = res.headers.get('retry-after')
      return { valid: true, status: 'quota_exceeded', detail: retry ? `Rate limited; retry after ${retry}s.` : 'Rate limited.', checkedAt }
    }
    return { valid: false, status: 'error', detail: `Unexpected HTTP ${res.status}.`, checkedAt }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('abort')) return { valid: false, status: 'error', detail: `Timed out after ${TIMEOUT_MS}ms.`, checkedAt }
    return { valid: false, status: 'error', detail: msg, checkedAt }
  } finally {
    clearTimeout(timer)
  }
}
