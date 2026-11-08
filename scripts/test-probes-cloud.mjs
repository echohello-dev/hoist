#!/usr/bin/env node
/**
 * Unit tests for src/main/probes/{aws,gcp,azure}.ts (via dist build).
 * All HTTP is mocked with a local fixture server. No live provider keys.
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const rel of ['dist/main/probes/aws.js', 'dist/main/probes/gcp.js', 'dist/main/probes/azure.js', 'dist/main/probes/index.js']) {
  if (!existsSync(join(root, rel))) {
    console.error(`${rel} missing - run npm run build:main first`)
    process.exit(1)
  }
}

const require = createRequire(import.meta.url)
const { probeBedrock, signBedrockRequest, parseAwsError } = require(join(root, 'dist/main/probes/aws.js'))
const { probeVertex, vertexModelsUrl } = require(join(root, 'dist/main/probes/gcp.js'))
const { probeAzure } = require(join(root, 'dist/main/probes/azure.js'))
const { runProbe } = require(join(root, 'dist/main/probes/index.js'))

let failed = 0
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

// Deterministic fixture server: handler swapped per case, requests recorded.
let handler = (_req, res) => { res.writeHead(200); res.end('{}') }
const requests = []
const server = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url, headers: req.headers })
  handler(req, res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const endpoint = `http://127.0.0.1:${server.address().port}`
const lastRequest = () => requests[requests.length - 1]

// Keep the AWS env chain empty unless a case sets it explicitly.
const savedEnv = { ...process.env }
for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_REGION', 'AWS_DEFAULT_REGION']) {
  delete process.env[key]
}

const fakeCreds = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }

// AWS: unconfigured credential chain.
{
  const r = await probeBedrock({ endpoint })
  assert(r.valid === false && r.status === 'invalid', 'aws no credentials returns invalid')
  assert(r.detail.includes('AWS error:'), 'aws no credentials detail carries AWS error')
}

// AWS: signed request validates against a mocked 200.
{
  handler = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"modelSummaries":[]}') }
  const before = requests.length
  const r = await probeBedrock({ credentials: fakeCreds, region: 'us-east-1', endpoint })
  assert(r.valid === true && r.status === 'ok', 'aws mocked 200 returns ok')
  assert(requests.length === before + 1, 'aws probe hit the fixture server once')
  const req = lastRequest()
  assert(req.url === '/foundation-models', 'aws request path is /foundation-models')
  assert(req.headers['x-amz-date'], 'aws request carries x-amz-date')
  const auth = req.headers.authorization ?? ''
  assert(auth.startsWith('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/'), 'aws Authorization uses SigV4 credential scope')
  assert(auth.includes('/us-east-1/bedrock/aws4_request'), 'aws credential scope names region and bedrock service')
  assert(/Signature=[0-9a-f]{64}/.test(auth), 'aws Authorization carries a hex signature')
}

// AWS: mocked 403 XML error surfaces the AWS error code.
{
  handler = (_req, res) => {
    res.writeHead(403, { 'content-type': 'application/xml' })
    res.end('<Error><Code>AccessDeniedException</Code><Message>not entitled</Message></Error>')
  }
  const r = await probeBedrock({ credentials: fakeCreds, region: 'us-east-1', endpoint })
  assert(r.valid === false && r.status === 'invalid', 'aws mocked 403 returns invalid')
  assert(r.detail.includes('AWS error: AccessDeniedException'), 'aws detail surfaces the AWS error code')
  assert(r.detail.includes('not entitled'), 'aws detail surfaces the AWS error message')
}

// AWS: signing is deterministic for a fixed clock and secret-sensitive.
{
  const now = new Date('2026-01-02T03:04:05Z')
  const a = signBedrockRequest({ endpoint: 'https://bedrock.us-east-1.amazonaws.com', region: 'us-east-1', credentials: fakeCreds, now })
  const b = signBedrockRequest({ endpoint: 'https://bedrock.us-east-1.amazonaws.com', region: 'us-east-1', credentials: fakeCreds, now })
  assert(a.headers.Authorization === b.headers.Authorization, 'aws SigV4 signature is deterministic for a fixed clock')
  const c = signBedrockRequest({ endpoint: 'https://bedrock.us-east-1.amazonaws.com', region: 'us-east-1', credentials: { ...fakeCreds, secretAccessKey: 'other-secret' }, now })
  assert(c.headers.Authorization !== a.headers.Authorization, 'aws SigV4 signature changes with the secret')
  const parsed = parseAwsError('<Error><Code>ValidationException</Code><Message>bad</Message></Error>')
  assert(parsed.code === 'ValidationException' && parsed.message === 'bad', 'parseAwsError reads XML code and message')
}

// GCP: project and region are required before any HTTP call.
{
  const before = requests.length
  const r = await probeVertex({ apiKey: 'ya29.fake-token' })
  assert(r.valid === false && r.status === 'error', 'gcp missing project and region returns error')
  assert(r.detail.includes('project and region'), 'gcp missing config detail names project and region')
  assert(requests.length === before, 'gcp missing config makes no HTTP request')
  const noToken = await probeVertex({ apiKey: '', project: 'my-project', region: 'us-central1', endpoint })
  assert(noToken.valid === false && noToken.status === 'invalid', 'gcp missing token returns invalid')
}

// GCP: mocked 200 validates, mocked 403 surfaces the Google error.
{
  handler = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"models":[]}') }
  const r = await probeVertex({ apiKey: 'ya29.fake-token', project: 'my-project', region: 'us-central1', endpoint })
  assert(r.valid === true && r.status === 'ok', 'gcp mocked 200 returns ok')
  const req = lastRequest()
  assert(req.url === '/v1/projects/my-project/locations/us-central1/publishers/google/models', 'gcp request path carries project and region')
  assert(req.headers.authorization === 'Bearer ya29.fake-token', 'gcp request sends the Bearer token')

  handler = (_req, res) => {
    res.writeHead(403, { 'content-type': 'application/json' })
    res.end('{"error":{"status":"PERMISSION_DENIED","message":"Permission denied"}}')
  }
  const denied = await probeVertex({ apiKey: 'ya29.fake-token', project: 'my-project', region: 'us-central1', endpoint })
  assert(denied.valid === false && denied.status === 'invalid', 'gcp mocked 403 returns invalid')
  assert(denied.detail.includes('PERMISSION_DENIED'), 'gcp detail surfaces the Google error status')
  assert(
    vertexModelsUrl('p', 'global') === 'https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models',
    'gcp global region uses the global aiplatform host',
  )
}

// Azure: endpoint required, mocked 200 validates with the api-key header.
{
  const noEndpoint = await probeAzure({ apiKey: 'fake-key' })
  assert(noEndpoint.valid === false && noEndpoint.status === 'error', 'azure missing endpoint returns error')
  assert(noEndpoint.detail.includes('endpoint'), 'azure missing endpoint detail names the endpoint')

  handler = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"data":[]}') }
  const r = await probeAzure({ apiKey: 'fake-key', baseUrl: endpoint })
  assert(r.valid === true && r.status === 'ok', 'azure mocked 200 returns ok')
  const req = lastRequest()
  assert(req.url === '/openai/deployments?api-version=2024-02-01', 'azure request path lists deployments')
  assert(req.headers['api-key'] === 'fake-key', 'azure request sends the api-key header')

  handler = (_req, res) => { res.writeHead(401); res.end('{}') }
  const denied = await probeAzure({ apiKey: 'fake-key', baseUrl: endpoint })
  assert(denied.valid === false && denied.status === 'invalid', 'azure mocked 401 returns invalid')
}

// runProbe dispatch: cloud kinds no longer fall through to No probe implemented.
{
  const bedrock = await runProbe({ providerId: 'bedrock', apiKey: '' })
  assert(bedrock.detail.includes('AWS error:'), 'runProbe dispatches bedrock to the aws probe')
  const vertex = await runProbe({ providerId: 'vertex', apiKey: 'ya29.fake-token' })
  assert(vertex.detail.includes('project and region'), 'runProbe dispatches vertex to the gcp probe')
  const azure = await runProbe({ providerId: 'azure-openai', apiKey: 'fake-key' })
  assert(azure.detail.includes('endpoint'), 'runProbe dispatches azure-openai to the azure probe')
  const unknown = await runProbe({ providerId: 'no-such-provider', apiKey: 'x' })
  assert(unknown.detail.includes('No probe implemented'), 'runProbe still reports unimplemented providers')
}

Object.assign(process.env, savedEnv)
server.close()
if (failed > 0) {
  console.error(`\n${failed} cloud probe case(s) failed`)
  process.exit(1)
}
console.log('\nall cloud probe cases passed')
