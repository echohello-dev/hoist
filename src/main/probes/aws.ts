import { createHash, createHmac } from 'node:crypto'
import type { ProbeResult } from './types'

const TIMEOUT_MS = 5000
const SERVICE = 'bedrock'
const DEFAULT_REGION = 'us-east-1'

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export interface BedrockProbeOptions {
  /** Explicit credentials. Falls back to the AWS env chain when omitted. */
  credentials?: AwsCredentials
  /** Region override. Falls back to AWS_REGION / AWS_DEFAULT_REGION / us-east-1. */
  region?: string
  /** Endpoint override (tests). Defaults to the Bedrock control plane for the region. */
  endpoint?: string
  /** Clock override (tests) so the SigV4 signature is deterministic. */
  now?: Date
}

function credentialsFromEnv(): AwsCredentials | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) return null
  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  }
}

function regionFromEnv(): string {
  return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? DEFAULT_REGION
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest()
}

/** Sign a GET request with AWS Signature Version 4 for the bedrock service. */
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

  const headers: Record<string, string> = {
    host,
    'x-amz-date': amzDate,
  }
  if (opts.credentials.sessionToken) {
    headers['x-amz-security-token'] = opts.credentials.sessionToken
  }
  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join('')
  const signedHeaders = signedHeaderNames.join(';')
  const payloadHash = sha256Hex('')

  const canonicalRequest = ['GET', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStamp}/${opts.region}/${SERVICE}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')

  const kDate = hmac(`AWS4${opts.credentials.secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, opts.region)
  const kService = hmac(kRegion, SERVICE)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${opts.credentials.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return { url: url.toString(), headers }
}

/** Extract the AWS error code and message from an XML or JSON error body. */
export function parseAwsError(body: string): { code?: string; message?: string } {
  const code = body.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? body.match(/"__type"\s*:\s*"[^"#]*#([^"]+)"/)?.[1]
  const message =
    body.match(/<Message>([^<]+)<\/Message>/)?.[1] ??
    body.match(/"message"\s*:\s*"([^"]+)"/i)?.[1]
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
  const { url, headers } = signBedrockRequest({
    endpoint,
    region,
    credentials,
    now: opts.now ?? new Date(),
  })

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
