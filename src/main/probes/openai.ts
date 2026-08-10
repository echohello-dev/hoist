import type { ProbeResult } from './types'

const OPENAI_BASE = 'https://api.openai.com/v1'
const TIMEOUT_MS = 5000

export interface OpenAIProbeOptions {
  apiKey: string
  baseUrl?: string
}

export async function probeOpenAI(opts: OpenAIProbeOptions): Promise<ProbeResult> {
  const { apiKey, baseUrl = OPENAI_BASE } = opts
  const checkedAt = new Date().toISOString()

  if (!apiKey) {
    return { valid: false, status: 'invalid', detail: 'No API key supplied.', checkedAt }
  }

  const root = baseUrl.replace(/\/$/, '')
  const url = root.endsWith('/v1') ? `${root}/models` : `${root}/v1/models`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    })
    if (res.ok) {
      return { valid: true, status: 'ok', detail: 'Key validated against /models.', checkedAt }
    }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, status: 'invalid', detail: `Authentication failed (${res.status}).`, checkedAt }
    }
    if (res.status === 429) {
      return {
        valid: true,
        status: 'quota_exceeded',
        detail: 'Rate limited.',
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
