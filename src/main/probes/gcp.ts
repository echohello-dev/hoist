import type { ProbeResult } from './types'

const TIMEOUT_MS = 5000
const API_VERSION_PATH = 'publishers/google/models'

export interface VertexProbeOptions {
  /** OAuth2 access token (for example from ADC via gcloud) sent as Bearer. */
  apiKey: string
  /** GCP project id. Required; the probe errors without it. */
  project?: string
  /** Vertex region, for example us-central1 or global. Required. */
  region?: string
  /** Endpoint override (tests). Defaults to the regional aiplatform host. */
  endpoint?: string
}

export function vertexModelsUrl(project: string, region: string, endpoint?: string): string {
  const base =
    endpoint ??
    (region === 'global'
      ? 'https://aiplatform.googleapis.com'
      : `https://${region}-aiplatform.googleapis.com`)
  return `${base.replace(/\/$/, '')}/v1/projects/${project}/locations/${region}/${API_VERSION_PATH}`
}

function parseGoogleError(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { status?: string; message?: string } }
    if (parsed.error?.message) {
      return parsed.error.status ? `${parsed.error.status}: ${parsed.error.message}` : parsed.error.message
    }
  } catch {
    // fall through to the raw body snippet
  }
  return body.trim() ? body.trim().slice(0, 200) : undefined
}

export async function probeVertex(opts: VertexProbeOptions): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString()

  if (!opts.project || !opts.region) {
    return {
      valid: false,
      status: 'error',
      detail: 'Vertex probe requires a GCP project and region. Save a project id and region for this key first.',
      checkedAt,
    }
  }

  if (!opts.apiKey) {
    return {
      valid: false,
      status: 'invalid',
      detail: 'No access token supplied. Run `gcloud auth application-default login` and try again.',
      checkedAt,
    }
  }

  const url = vertexModelsUrl(opts.project, opts.region, opts.endpoint)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      signal: controller.signal,
    })
    if (res.ok) {
      return { valid: true, status: 'ok', detail: 'Credentials validated against Vertex AI publishers/google/models.', checkedAt }
    }
    const body = await res.text().catch(() => '')
    const googleDetail = parseGoogleError(body)
    if (res.status === 401 || res.status === 403) {
      return {
        valid: false,
        status: 'invalid',
        detail: googleDetail ? `Vertex error: ${googleDetail}` : `Authentication failed (${res.status}).`,
        checkedAt,
      }
    }
    if (res.status === 429) {
      return { valid: true, status: 'quota_exceeded', detail: 'Vertex rate limited; credential accepted.', checkedAt }
    }
    return {
      valid: false,
      status: 'error',
      detail: googleDetail ? `Vertex error: ${googleDetail}` : `Unexpected HTTP ${res.status}.`,
      checkedAt,
    }
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
