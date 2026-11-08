#!/usr/bin/env node
/**
 * Unit tests for probe context resolution (src/main/probes/context.ts).
 * Pure logic, no Electron and no live provider keys.
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contextJs = join(root, 'dist/main/probes/context.js')
if (!existsSync(contextJs)) {
  console.error('dist/main/probes/context.js missing - run npm run build:main first')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { buildProbeContext, probeRequiresApiKey } = require(contextJs)

let failed = 0
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

{
  const ctx = buildProbeContext({ providerId: 'vertex', apiKey: 'tok', storedProject: 'stored-proj', storedRegion: 'europe-west1' })
  assert(ctx.project === 'stored-proj', 'stored project is used when explicit is missing')
  assert(ctx.region === 'europe-west1', 'stored region is used when explicit is missing')
  assert(ctx.apiKey === 'tok' && ctx.providerId === 'vertex', 'api key and provider pass through')
}
{
  const ctx = buildProbeContext({ providerId: 'vertex', apiKey: 'tok', project: 'explicit-proj', region: 'us-central1', storedProject: 'stored-proj', storedRegion: 'europe-west1' })
  assert(ctx.project === 'explicit-proj', 'explicit project wins over stored')
  assert(ctx.region === 'us-central1', 'explicit region wins over stored')
}
{
  const ctx = buildProbeContext({ providerId: 'vertex', apiKey: 'tok', project: '  ', region: '', storedProject: ' stored-proj ', storedRegion: ' europe-west1 ' })
  assert(ctx.project === 'stored-proj', 'blank explicit project falls back to trimmed stored')
  assert(ctx.region === 'europe-west1', 'blank explicit region falls back to trimmed stored')
}
{
  const ctx = buildProbeContext({ providerId: 'vertex', apiKey: 'tok', storedProject: '  ', storedRegion: '' })
  assert(ctx.project === undefined, 'blank stored project becomes undefined')
  assert(ctx.region === undefined, 'blank stored region becomes undefined')
}
{
  const ctx = buildProbeContext({ providerId: 'anthropic' })
  assert(ctx.apiKey === '', 'missing api key becomes empty string')
  assert(ctx.project === undefined && ctx.region === undefined, 'non-cloud provider has no project or region')
}
assert(probeRequiresApiKey('aws') === false, 'aws probe does not require a vault api key')
assert(probeRequiresApiKey('gcp') === true, 'gcp probe requires a token')
assert(probeRequiresApiKey('azure') === true, 'azure probe requires a key')
assert(probeRequiresApiKey('anthropicModels') === true, 'anthropic probe requires a key')
assert(probeRequiresApiKey(undefined) === true, 'unknown probe kind requires a key by default')

if (failed > 0) {
  console.error(`\n${failed} probe context case(s) failed`)
  process.exit(1)
}
console.log('\nall probe context cases passed')
