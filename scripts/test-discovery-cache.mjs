#!/usr/bin/env node
/**
 * Unit tests for the OpenCode discovery cache (via dist build).
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const installerJs = join(root, 'dist/main/installer/index.js')

if (!existsSync(installerJs)) {
  console.error('dist/main/installer/index.js missing - run npm run build:main first')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { parseDiscoveryCache, discoveryCachePath, DISCOVERY_CACHE_TTL_MS } = require(installerJs)

let failed = 0
function assert(cond, msg) {
  if (cond) console.log(`  ok ${msg}`)
  else {
    failed++
    console.error(`  FAIL ${msg}`)
  }
}

const now = 1_700_000_000_000
const fresh = { 'claude-code': { path: '/opt/homebrew/bin/claude', version: '2.1.204' } }

assert(parseDiscoveryCache(fresh, now, now)?.['claude-code']?.version === '2.1.204', 'fresh cache parses')
assert(parseDiscoveryCache(fresh, now, now + DISCOVERY_CACHE_TTL_MS) !== null, 'cache at TTL boundary is fresh')
assert(parseDiscoveryCache(fresh, now, now + DISCOVERY_CACHE_TTL_MS + 1) === null, 'stale cache rejected')
assert(parseDiscoveryCache(null, now, now) === null, 'null payload rejected')
assert(parseDiscoveryCache('nope', now, now) === null, 'string payload rejected')
assert(parseDiscoveryCache([], now, now) === null, 'array payload rejected')
assert(parseDiscoveryCache({}, now, now) === null, 'empty payload rejected')
assert(parseDiscoveryCache({ x: { version: '1' } }, now, now) === null, 'entry without path dropped')
assert(
  parseDiscoveryCache({ x: { path: '/bin/x', version: 3 } }, now, now)?.x?.version === null,
  'non-string version normalised to null',
)
assert(discoveryCachePath('/Users/x').endsWith(join('.cache', 'hoist', 'discovery.json')), 'cache path shape')

if (failed > 0) {
  console.error(`\n${failed} discovery cache assertion(s) failed`)
  process.exit(1)
}
console.log('\nall discovery cache cases passed')
