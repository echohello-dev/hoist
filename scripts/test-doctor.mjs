#!/usr/bin/env node
/**
 * Unit tests for src/shared/doctor.ts (via dist build).
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const doctorJs = join(root, 'dist/shared/doctor.js')

if (!existsSync(doctorJs)) {
  console.error('dist/shared/doctor.js missing — run npm run build:main first')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { analyzeLibrary, catalogBinaryName } = require(doctorJs)

let failed = 0
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

function nodeEntry() {
  return {
    id: 'node',
    catalogId: 'node',
    kind: 'runtime',
    name: 'Node.js',
    status: 'installed',
    version: '26.0.0',
    path: '/opt/homebrew/bin/node',
    source: 'Homebrew',
    packageManager: 'homebrew',
    homebrew: 'formula',
    primary: true,
    installs: [
      {
        path: '/opt/homebrew/bin/node',
        realPath: '/opt/homebrew/Cellar/node/26.0.0/bin/node',
        version: '26.0.0',
        source: 'Homebrew',
        packageManager: 'homebrew',
        homebrew: 'formula',
        primary: true,
      },
    ],
  }
}

// --- catalogBinaryName ---
assert(catalogBinaryName('claude-code') === 'claude', 'claude-code → claude')
assert(catalogBinaryName('opencode') === 'opencode', 'opencode → opencode')
assert(catalogBinaryName('python') === 'python3', 'python → python3')

// --- single install + node present: healthy ---
{
  const report = analyzeLibrary([
    {
      id: 'claude-code',
      catalogId: 'claude-code',
      kind: 'harness',
      name: 'Claude Code',
      status: 'installed',
      version: '2.1.226',
      path: '/opt/homebrew/bin/claude',
      source: 'Homebrew Cask',
      packageManager: 'homebrew',
      homebrew: 'cask',
      primary: true,
      installs: [
        {
          path: '/opt/homebrew/bin/claude',
          realPath: '/opt/homebrew/Caskroom/claude-code/2.1.226/claude',
          version: '2.1.226',
          source: 'Homebrew Cask',
          packageManager: 'homebrew',
          homebrew: 'cask',
          primary: true,
        },
      ],
    },
    nodeEntry(),
  ])
  assert(report.summary.error === 0, 'single install: no errors')
  assert(report.summary.warn === 0, 'single install: no warns')
  assert(report.findings.some((f) => f.severity === 'ok'), 'single install: healthy finding')
}

// --- multi-install harness version skew → warn + fix actions ---
{
  const report = analyzeLibrary([
    nodeEntry(),
    {
      id: 'claude-code#1',
      catalogId: 'claude-code',
      kind: 'harness',
      name: 'Claude Code',
      status: 'installed',
      version: '2.1.211',
      path: '/opt/homebrew/bin/claude',
      source: 'Homebrew Cask',
      packageManager: 'homebrew',
      homebrew: 'cask',
      primary: true,
      installs: [
        {
          path: '/opt/homebrew/bin/claude',
          realPath: '/a',
          version: '2.1.211',
          source: 'Homebrew Cask',
          packageManager: 'homebrew',
          homebrew: 'cask',
          primary: true,
        },
        {
          path: '/usr/local/bin/claude',
          realPath: '/b',
          version: '2.0.76',
          source: 'npm',
          packageManager: 'npm',
          homebrew: null,
          primary: false,
        },
      ],
    },
  ])
  assert(report.summary.error === 0, 'version skew: not an error')
  assert(report.summary.warn >= 1, 'version skew: at least one warn')
  const shadow = report.findings.find((f) => f.id === 'shadow:claude-code')
  assert(!!shadow, 'version skew: shadow finding exists')
  const actions = (shadow?.resolutions ?? []).filter((r) => r.action)
  assert(actions.some((r) => r.action?.type === 'upgrade'), 'has upgrade action')
  assert(actions.some((r) => r.action?.type === 'reconfigure'), 'has reconfigure action')
  assert(actions.some((r) => r.action?.type === 'uninstall'), 'has uninstall action for npm dup')
}

// --- node multi-install is info, not warn ---
{
  const report = analyzeLibrary([
    {
      id: 'node#1',
      catalogId: 'node',
      kind: 'runtime',
      name: 'Node.js',
      status: 'installed',
      version: '26.7.0',
      path: '/opt/homebrew/bin/node',
      source: 'Homebrew',
      packageManager: 'homebrew',
      homebrew: 'formula',
      primary: true,
      installs: [
        {
          path: '/opt/homebrew/bin/node',
          realPath: '/a',
          version: '26.7.0',
          source: 'Homebrew',
          packageManager: 'homebrew',
          homebrew: 'formula',
          primary: true,
        },
        {
          path: '/Users/x/.asdf/shims/node',
          realPath: '/b',
          version: '22.9.0',
          source: 'asdf',
          packageManager: 'asdf',
          homebrew: null,
          primary: false,
        },
      ],
    },
  ])
  const shadow = report.findings.find((f) => f.id === 'shadow:node')
  assert(shadow?.severity === 'info', 'node multi-version is info')
  assert(report.summary.error === 0, 'node multi: no errors')
  assert(report.summary.warn === 0, 'node multi: no warns (node present)')
}

// --- missing node → warn ---
{
  const report = analyzeLibrary([])
  assert(report.findings.some((f) => f.id === 'missing:node' && f.severity === 'warn'), 'missing node warns')
}

if (failed > 0) {
  console.error(`\n${failed} doctor assertion(s) failed`)
  process.exit(1)
}
console.log('\nall doctor cases passed')
