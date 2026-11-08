import { createHash, createHmac } from 'node:crypto'
import type { ProviderEntry } from './providers'

const ANTHROPIC_VERSION = '2023-06-01'
const TIMEOUT_MS = 5000

export interface ProbeResult {
  valid: boolean
  status: 'ok' | 'invalid' | 'expired' | 'quota_exceeded' | 'error'
  detail?: string
  checkedAt: string
}

export interface ProbeOptions {
  project?: string
  region?: string
  /** Endpoint override (tests). */
  endpoint?: string
}

/** Providers that share the OpenAI-compatible /models probe (mirrors app). */
const OPENAI_COMPAT = new Set([
  'openai',
  'groq',
  'openrouter',
  'together',
  'fireworks',
  'deepseek',
  'mistral',
  'xai',
  'perplexity',
  'custom-openai',
])

export async function probeProvider(
  provider: ProviderEntry,
  apiKey: string,
  baseUrl?: string,
  opts: ProbeOptions = {},
): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString()
  if (provider.id === 'anthropic' || provider.probeKind === 'anthropicModels') {
    if (!apiKey) return { valid: false, status: 'invalid', detail: 'No API key supplied.', checkedAt }
    return probeAnthropic({ apiKey, baseUrl: baseUrl ?? provider.defaultBaseUrl ?? 'https://api.anthropic.com' })
  }
  if (provider.probeKind === 'openaiModels' || OPENAI_COMPAT.has(provider.id)) {
    if (!apiKey) return { valid: false, status: 'invalid', detail: 'No API key supplied.', checkedAt }
    return probeOpenAI({ apiKey, baseUrl: baseUrl ?? provider.defaultBaseUrl })
  }
  if (provider.probeKind === 'aws') {
    return probeBedrock({ region: opts.region, endpoint: opts.endpoint })
  }
  if (provider.probeKind === 'gcp') {
    return probeVertex({ apiKey, project: opts.project, region: opts.region, endpoint: opts.endpoint })
  }
  if (provider.probeKind === 'azure') {
    return probeAzure({ apiKey, baseUrl: baseUrl ?? provider.defaultBaseUrl })
  }
  if (!apiKey) {
    return { valid: false, status: 'invalid', detail: 'No API key supplied.', checkedAt }
  }
  return { valid: false, status: 'error', detail: `No probe implemented for "${provider.id}".`, checkedAt }
}

export async function probeAnthropic({ apiKey, baseUrl }: { apiKey: string; baseUrl: string }): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/models?limit=1`, {
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

export async function probeOpenAI({ apiKey, baseUrl }: { apiKey: string; baseUrl?: string }): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString()
  const root = (baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const url = root.endsWith('/v1') ? `${root}/models` : `${root}/v1/models`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    if (res.ok) return { valid: true, status: 'ok', detail: 'Key validated against /models.', checkedAt }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, status: 'invalid', detail: `Authentication failed (${res.status}).`, checkedAt }
    }
    if (res.status === 429) {
      return { valid: true, status: 'quota_exceeded', detail: 'Rate limited.', checkedAt }
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

const AWS_SERVICE = 'bedrock'
const AWS_DEFAULT_REGION = 'us-east-1'

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export interface BedrockProbeOptions {
  credentials?: AwsCredentials
  region?: string
  endpoint?: string
  now?: Date
}

function credentialsFromEnv(): AwsCredentials | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return null
  return { accessKeyId, secretAccessKey, sessionToken: process.env.AWS_SESSION_TOKEN }
}

function regionFromEnv(): string {
  return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? AWS_DEFAULT_REGION
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest()
}

export function signBedrockRequest(opts: {
  endpoint: string
  region: string
  credentials: AwsCredentials
  now: Date
}): { url: string; headers: Record<string, string> } {
  const url = new URL('/foundation-models', opts.endpoint)
  const host = url.host
  const amzDate = opts.now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const headers: Record<string, string> = { host, 'x-amz-date': amzDate }
  if (opts.credentials.sessionToken) {
    headers['x-amz-security-token'] = opts.credentials.sessionToken
  }
  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join('')
  const signedHeaders = signedHeaderNames.join(';')
  const payloadHash = sha256Hex('')
  const canonicalRequest = ['GET', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStamp}/${opts.region}/${AWS_SERVICE}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const kDate = hmac(`AWS4${opts.credentials.secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, opts.region)
  const kService = hmac(kRegion, AWS_SERVICE)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')
  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${opts.credentials.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`
  return { url: url.toString(), headers }
}

export function parseAwsError(body: string): { code?: string; message?: string } {
  const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? body.match(/"__type"\s*:\s*"[^"#]*#([^"]+)"/)?.[1]
  const message =
    body.match(/<Message>([^<]+)<\/Message>/)?.[1] ?? body.match(/"message"\s*:\s*"([^"]+)"/i)?.[1]
  return { code, message }
}

export async function probeBedrock(opts: BedrockProbeOptions = {}): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString()
  const credentials = opts.credentials ?? credentialsFromEnv()
  if (!credentials) {
    return {
      valid: false,
      status: 'invalid',
      detail:
        'AWS error: NoCredentialProviders: no AWS credentials found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or configure the standard AWS credential chain.',
      checkedAt,
    }
  }
  const region = opts.region ?? regionFromEnv()
  const endpoint = opts.endpoint ?? `https://bedrock.${region}.amazonaws.com`
  const { url, headers } = signBedrockRequest({ endpoint, region, credentials, now: opts.now ?? new Date() })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    if (res.ok) {
      return { valid: true, status: 'ok', detail: 'Credentials validated against Bedrock ListFoundationModels.', checkedAt }
    }
    const body = await res.text().catch(() => '')
    const { code, message } = parseAwsError(body)
    const awsDetail = code ? `AWS error: ${code}${message ? `: ${message}` : ''}` : `AWS error: Unexpected HTTP ${res.status}.`
    if (res.status === 429 || code === 'ThrottlingException') {
      return { valid: true, status: 'quota_exceeded', detail: awsDetail, checkedAt }
    }
    if (res.status === 401 || res.status === 403) {
      return { valid: false, status: 'invalid', detail: awsDetail, checkedAt }
    }
    return { valid: false, status: 'error', detail: awsDetail, checkedAt }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('abort')) {
      return { valid: false, status: 'error', detail: `Timed out after ${TIMEOUT_MS}ms.`, checkedAt }
    }
    return { valid: false, status: 'error', detail: `AWS error: ${message}`, checkedAt }
  } finally {
    clearTimeout(timer)
  }
}

export interface VertexProbeOptions {
  apiKey: string
  project?: string
  region?: string
  endpoint?: string
}

export function vertexModelsUrl(project: string, region: string, endpoint?: string): string {
  const base =
    endpoint ??
    (region === 'global' ? 'https://aiplatform.googleapis.com' : `https://${region}-aiplatform.googleapis.com`)
  return `${base.replace(/\/$/, '')}/v1/projects/${project}/locations/${region}/publishers/google/models`
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

export interface AzureProbeOptions {
  apiKey: string
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
  const apiVersion = opts.apiVersion ?? '2024-02-01'
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
