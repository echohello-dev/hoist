#!/usr/bin/env node
/**
 * Unit tests for Homebrew channel detection (via dist build).
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const libraryJs = join(root, 'dist/main/library.js')

if (!existsSync(libraryJs)) {
  console.error('dist/main/library.js missing — run npm run build:main first')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { detectHomebrew, sourceLabel, detectPackageManager } = require(libraryJs)

let failed = 0
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

const prefix = '/opt/homebrew'

assert(
  detectHomebrew('/opt/homebrew/bin/claude', '/opt/homebrew/Caskroom/claude-code/2.1.211/claude', prefix) === 'cask',
  'cask detection',
)
assert(
  detectHomebrew('/opt/homebrew/bin/node', '/opt/homebrew/Cellar/node/26.7.0/bin/node', prefix) === 'formula',
  'formula detection',
)
assert(
  detectHomebrew(
    '/opt/homebrew/bin/opencode',
    '/opt/homebrew/lib/node_modules/opencode-ai/bin/opencode.exe',
    prefix,
  ) === 'node',
  'homebrew node_modules → node channel',
)
assert(
  detectHomebrew('/Users/x/.asdf/shims/claude', '/Users/x/.asdf/shims/claude', prefix) === null,
  'asdf is not homebrew',
)
assert(
  detectHomebrew('/Users/x/.bun/bin/bun', '/Users/x/.bun/bin/bun', prefix) === null,
  'bun is not homebrew',
)

assert(
  sourceLabel('/opt/homebrew/bin/claude', '/opt/homebrew/Caskroom/claude-code/x/claude', 'cask') === 'Homebrew Cask',
  'source label cask',
)
assert(
  sourceLabel('/opt/homebrew/bin/opencode', '/opt/homebrew/lib/node_modules/opencode-ai/bin/x', 'node') ===
    'npm · Homebrew Node',
  'source label npm under brew node',
)

assert(
  detectPackageManager('/opt/homebrew/bin/claude', '/opt/homebrew/Caskroom/x', 'cask') === 'homebrew',
  'pm homebrew for cask',
)
assert(
  detectPackageManager('/opt/homebrew/bin/opencode', '/opt/homebrew/lib/node_modules/x', 'node') === 'npm',
  'pm npm for brew-node globals',
)
assert(
  detectPackageManager('/Users/x/.bun/bin/bun', '/Users/x/.bun/bin/bun', null) === 'bun',
  'pm bun',
)

if (failed > 0) {
  console.error(`\n${failed} homebrew assertion(s) failed`)
  process.exit(1)
}
console.log('\nall homebrew detection cases passed')
