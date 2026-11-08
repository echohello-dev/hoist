import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { probeAzure, probeBedrock, probeProvider, probeVertex, signBedrockRequest, vertexModelsUrl } from '../src/lib/probes'
import { findProvider } from '../src/lib/providers'
import { secretIdForProviderConfig } from '../src/lib/vault'

let handler: (req: IncomingMessage, res: ServerResponse) => void = (_req, res) => {
  res.writeHead(200)
  res.end('{}')
}
const requests: { method?: string; url?: string; headers: IncomingMessage['headers'] }[] = []
const server = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url, headers: req.headers })
  handler(req, res)
})
let endpoint = ''
const lastRequest = () => requests[requests.length - 1]
const fakeCreds = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  endpoint = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_REGION', 'AWS_DEFAULT_REGION']) {
    delete process.env[key]
  }
})

afterAll(() => {
  server.close()
})

describe('cli cloud probes (mocked HTTP, no live keys)', () => {
  test('vault sibling config secret ids match the app convention', () => {
    expect(secretIdForProviderConfig('vertex', 'project')).toBe('provider:vertex:project')
    expect(secretIdForProviderConfig('vertex', 'region')).toBe('provider:vertex:region')
  })

  test('aws no credentials returns invalid with AWS error', async () => {
    const r = await probeBedrock({ endpoint })
    expect(r.valid).toBe(false)
    expect(r.status).toBe('invalid')
    expect(r.detail).toContain('AWS error:')
  })

  test('aws mocked 200 returns ok and sends a SigV4 signed request', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"modelSummaries":[]}')
    }
    const before = requests.length
    const r = await probeBedrock({ credentials: fakeCreds, region: 'us-east-1', endpoint })
    expect(r.valid).toBe(true)
    expect(r.status).toBe('ok')
    expect(requests.length).toBe(before + 1)
    const req = lastRequest()
    expect(req.url).toBe('/foundation-models')
    expect(req.headers['x-amz-date']).toBeTruthy()
    const auth = String(req.headers.authorization ?? '')
    expect(auth.startsWith('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/')).toBe(true)
    expect(auth).toContain('/us-east-1/bedrock/aws4_request')
    expect(/Signature=[0-9a-f]{64}/.test(auth)).toBe(true)
  })

  test('aws mocked 403 surfaces the AWS error code', async () => {
    handler = (_req, res) => {
      res.writeHead(403, { 'content-type': 'application/xml' })
      res.end('<Error><Code>AccessDeniedException</Code><Message>not entitled</Message></Error>')
    }
    const r = await probeBedrock({ credentials: fakeCreds, region: 'us-east-1', endpoint })
    expect(r.valid).toBe(false)
    expect(r.status).toBe('invalid')
    expect(r.detail).toContain('AWS error: AccessDeniedException')
  })

  test('aws SigV4 signature is deterministic for a fixed clock', () => {
    const now = new Date('2026-01-02T03:04:05Z')
    const a = signBedrockRequest({ endpoint: 'https://bedrock.us-east-1.amazonaws.com', region: 'us-east-1', credentials: fakeCreds, now })
    const b = signBedrockRequest({ endpoint: 'https://bedrock.us-east-1.amazonaws.com', region: 'us-east-1', credentials: fakeCreds, now })
    expect(a.headers.Authorization).toBe(b.headers.Authorization)
  })

  test('gcp missing project and region returns error without HTTP', async () => {
    const before = requests.length
    const r = await probeVertex({ apiKey: 'ya29.fake-token' })
    expect(r.valid).toBe(false)
    expect(r.status).toBe('error')
    expect(r.detail).toContain('project and region')
    expect(requests.length).toBe(before)
  })

  test('gcp mocked 200 returns ok with project and region in the path', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"models":[]}')
    }
    const r = await probeVertex({ apiKey: 'ya29.fake-token', project: 'my-project', region: 'us-central1', endpoint })
    expect(r.valid).toBe(true)
    expect(lastRequest().url).toBe('/v1/projects/my-project/locations/us-central1/publishers/google/models')
    expect(lastRequest().headers.authorization).toBe('Bearer ya29.fake-token')
    expect(vertexModelsUrl('p', 'global')).toBe(
      'https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models',
    )
  })

  test('azure missing endpoint returns error, mocked 200 validates', async () => {
    const noEndpoint = await probeAzure({ apiKey: 'fake-key' })
    expect(noEndpoint.valid).toBe(false)
    expect(noEndpoint.detail).toContain('endpoint')
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"data":[]}')
    }
    const r = await probeAzure({ apiKey: 'fake-key', baseUrl: endpoint })
    expect(r.valid).toBe(true)
    expect(lastRequest().url).toBe('/openai/deployments?api-version=2024-02-01')
    expect(lastRequest().headers['api-key']).toBe('fake-key')
  })

  test('probeProvider dispatches cloud kinds instead of No probe implemented', async () => {
    const bedrock = findProvider('bedrock')
    const vertex = findProvider('vertex')
    const azure = findProvider('azure-openai')
    expect(bedrock).toBeTruthy()
    expect(vertex).toBeTruthy()
    expect(azure).toBeTruthy()
    const b = await probeProvider(bedrock!, '', undefined, { endpoint })
    expect(b.detail).toContain('AWS error:')
    const v = await probeProvider(vertex!, 'ya29.fake-token')
    expect(v.detail).toContain('project and region')
    const a = await probeProvider(azure!, 'fake-key')
    expect(a.detail).toContain('endpoint')
    const withConfig = await probeProvider(vertex!, 'ya29.fake-token', undefined, {
      project: 'my-project',
      region: 'us-central1',
      endpoint,
    })
    expect(withConfig.valid).toBe(true)
  })
})
