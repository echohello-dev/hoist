#!/usr/bin/env node
/**
 * Unit tests for vault secret id helpers.
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const secretsJs = join(root, 'dist/shared/secrets.js')

if (!existsSync(secretsJs)) {
  console.error('dist/shared/secrets.js missing — run npm run build:main first')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { secretIdForProvider, providerIdFromSecretId } = require(secretsJs)

let failed = 0
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

assert(secretIdForProvider('anthropic') === 'provider:anthropic:api_key', 'secret id format')
assert(secretIdForProvider('openai') === 'provider:openai:api_key', 'openai secret id')
assert(providerIdFromSecretId('provider:anthropic:api_key') === 'anthropic', 'parse anthropic')
assert(providerIdFromSecretId('provider:openai:api_key') === 'openai', 'parse openai')
assert(providerIdFromSecretId('random') === null, 'reject non-canonical')
assert(providerIdFromSecretId(secretIdForProvider('groq')) === 'groq', 'round-trip')

if (failed > 0) {
  console.error(`\n${failed} secrets assertion(s) failed`)
  process.exit(1)
}
console.log('\nall secrets cases passed')
