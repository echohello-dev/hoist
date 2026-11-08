import type { ProbeResult } from './types'

const TIMEOUT_MS = 5000
const DEFAULT_API_VERSION = '2024-02-01'

export interface AzureProbeOptions {
  apiKey: string
  /** Azure OpenAI resource endpoint, for example https://<resource>.openai.azure.com */
  baseUrl?: string
  apiVersion?: string
}

export async function probeAzure(opts: AzureProbeOptions): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString()

  if (!opts.baseUrl) {
    return {
      valid: false,
      status: 'error',
      detail: 'Azure probe requires an endpoint. Set the Azure OpenAI endpoint (AZURE_OPENAI_ENDPOINT) for this key first.',
      checkedAt,
    }
  }

  if (!opts.apiKey) {
    return { valid: false, status: 'invalid', detail: 'No API key supplied.', checkedAt }
  }

  const apiVersion = opts.apiVersion ?? DEFAULT_API_VERSION
  const url = `${opts.baseUrl.replace(/\/$/, '')}/openai/deployments?api-version=${apiVersion}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'api-key': opts.apiKey },
      signal: controller.signal,
    })
    if (res.ok) {
      return { valid: true, status: 'ok', detail: 'Key validated against Azure OpenAI deployments.', checkedAt }
    }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, status: 'invalid', detail: `Authentication failed (${res.status}).`, checkedAt }
    }
    if (res.status === 429) {
      return { valid: true, status: 'quota_exceeded', detail: 'Rate limited; credential accepted.', checkedAt }
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
