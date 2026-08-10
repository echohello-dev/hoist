#!/usr/bin/env node
/**
 * Unit tests for version compare + changelog parsing (via dist build).
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const versionsJs = join(root, 'dist/main/installer/versions.js')

if (!existsSync(versionsJs)) {
  console.error('dist/main/installer/versions.js missing — run npm run build:main first')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const {
  compareVersions,
  parseChangelogMarkdown,
  changelogBetween,
} = require(versionsJs)

let failed = 0
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

// compareVersions
assert(compareVersions('2.1.211', '2.1.226') < 0, '2.1.211 < 2.1.226')
assert(compareVersions('2.1.226', '2.1.211') > 0, '2.1.226 > 2.1.211')
assert(compareVersions('2.1.211', '2.1.211') === 0, 'equal versions')
assert(compareVersions('v2.0.0', '2.0.0') === 0, 'strips v prefix')

// parse changelog
const md = `# Changelog

## 2.1.226

- Bug fixes

## 2.1.225

- Feature A
- Feature B

## 2.1.211

- Old stuff
`
const map = parseChangelogMarkdown(md)
assert(map.has('2.1.226'), 'parsed 2.1.226')
assert(map.has('2.1.225'), 'parsed 2.1.225')
assert(map.get('2.1.225')?.includes('Feature A'), 'body preserved')

// changelog between current → latest (exclusive of from)
const range = changelogBetween(map, '2.1.211', '2.1.226')
assert(range.some((e) => e.version === '2.1.226'), 'includes latest')
assert(range.some((e) => e.version === '2.1.225'), 'includes middle')
assert(!range.some((e) => e.version === '2.1.211'), 'excludes current/from')
assert(compareVersions(range[0].version, range[range.length - 1].version) >= 0, 'newest first')

if (failed > 0) {
  console.error(`\n${failed} versions assertion(s) failed`)
  process.exit(1)
}
console.log('\nall versions cases passed')
