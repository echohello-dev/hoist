import type { ProbeResult } from './types'

const ANTHROPIC_BASE = 'https://api.anthropic.com'
const ANTHROPIC_VERSION = '2023-06-01'
const TIMEOUT_MS = 5000

export interface AnthropicProbeOptions {
  apiKey: string
  baseUrl?: string
}

export async function probeAnthropic(opts: AnthropicProbeOptions): Promise<ProbeResult> {
  const { apiKey, baseUrl = ANTHROPIC_BASE } = opts
  const checkedAt = new Date().toISOString()

  if (!apiKey) {
    return { valid: false, status: 'invalid', detail: 'No API key supplied.', checkedAt }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/v1/models?limit=1`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      signal: controller.signal,
    })
    if (res.ok) {
      return { valid: true, status: 'ok', detail: 'Key validated against /v1/models.', checkedAt }
    }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, status: 'invalid', detail: `Authentication failed (${res.status}).`, checkedAt }
    }
    if (res.status === 429) {
      const reset = res.headers.get('retry-after')
      return {
        valid: true,
        status: 'quota_exceeded',
        detail: reset ? `Rate limited; retry after ${reset}s.` : 'Rate limited.',
        checkedAt,
      }
    }
    return { valid: false, status: 'error', detail: `Unexpected HTTP ${res.status}.`, checkedAt }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('abort')) {
      return { valid: false, status: 'error', detail: `Timed out after ${TIMEOUT_MS}ms.`, checkedAt }
    }
    return { valid: false, status: 'error', detail: message, checkedAt }
  } finally {
    clearTimeout(timer)
  }
}
