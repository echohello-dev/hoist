#!/usr/bin/env node
/**
 * Unit tests for src/main/wiring/codexAuth.ts (via dist build).
 */
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modPath = join(root, 'dist/main/wiring/codexAuth.js')
const wiringPath = join(root, 'dist/main/wiring/index.js')

if (!existsSync(modPath)) {
  console.error('dist/main/wiring/codexAuth.js missing - run npm run build:main first')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { applyCodexAuthWiring, codexAuthPath, CODEX_AUTH_PLATFORM_NOTE } = require(modPath)
const { applyWiring } = require(wiringPath)

let failed = 0
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`)
  else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

const home = mkdtempSync(join(tmpdir(), 'hoist-codex-auth-'))
const authPath = codexAuthPath(home)
assert(authPath === join(home, '.codex', 'auth.json'), 'codexAuthPath joins .codex/auth.json')

// Fresh write on darwin creates the file with the key and 0600 perms.
{
  const r = await applyCodexAuthWiring({ apiKey: 'sk-test-redacted' }, { homeDir: home, platform: 'darwin' })
  assert(r.changed === true && r.path === authPath, 'darwin write reports changed')
  const parsed = JSON.parse(readFileSync(authPath, 'utf8'))
  assert(parsed.OPENAI_API_KEY === 'sk-test-redacted', 'auth.json contains OPENAI_API_KEY')
  if (process.platform !== 'win32') {
    assert((statSync(authPath).mode & 0o777) === 0o600, 'auth.json mode is 0600')
  }
}

// Existing keys are preserved and the key is updated.
{
  writeFileSync(authPath, JSON.stringify({ OPENAI_API_KEY: 'old', tokens: { id: 'keep-me' }, other: 1 }))
  const r = await applyCodexAuthWiring({ apiKey: 'sk-new' }, { homeDir: home, platform: 'darwin' })
  assert(r.changed === true, 'second write reports changed')
  const parsed = JSON.parse(readFileSync(authPath, 'utf8'))
  assert(parsed.OPENAI_API_KEY === 'sk-new', 'OPENAI_API_KEY updated')
  assert(parsed.tokens?.id === 'keep-me' && parsed.other === 1, 'existing auth.json keys preserved')
}

// Non-darwin platforms skip with the env note and do not write.
for (const platform of ['linux', 'win32']) {
  const h = mkdtempSync(join(tmpdir(), 'hoist-codex-skip-'))
  const r = await applyCodexAuthWiring({ apiKey: 'sk-x' }, { homeDir: h, platform })
  assert(r.changed === false && r.note === CODEX_AUTH_PLATFORM_NOTE, `${platform} skips with env note`)
  assert(!existsSync(codexAuthPath(h)), `${platform} does not create auth.json`)
}

// File-storage guard and empty key skip without writing.
{
  const h = mkdtempSync(join(tmpdir(), 'hoist-codex-guard-'))
  const r1 = await applyCodexAuthWiring({ apiKey: 'sk-x' }, { homeDir: h, platform: 'darwin', storeInFile: false })
  assert(r1.changed === false && !existsSync(codexAuthPath(h)), 'storeInFile false skips write')
  const r2 = await applyCodexAuthWiring({ apiKey: '' }, { homeDir: h, platform: 'darwin' })
  assert(r2.changed === false && !existsSync(codexAuthPath(h)), 'empty api key skips write')
}

// applyWiring for codex returns both the config.toml and auth.json results.
{
  const h = mkdtempSync(join(tmpdir(), 'hoist-codex-wire-'))
  mkdirSync(join(h, '.codex'), { recursive: true })
  const prevHome = process.env.HOME
  process.env.HOME = h
  try {
    const results = await applyWiring({
      apiKey: 'sk-wire',
      baseUrl: 'https://example.invalid/v1',
      harness: { id: 'codex', label: 'Codex', installMethods: [] },
      provider: { id: 'openai', label: 'OpenAI', authType: 'api_key', probeKind: 'openaiModels' },
      gateway: null,
      homeDir: h,
      platform: 'darwin',
    })
    assert(results.length === 2, 'applyWiring codex returns two results')
    assert(results.some((r) => r.path.endsWith('auth.json') && r.changed), 'applyWiring includes changed auth.json result')
    assert(results.some((r) => r.path.endsWith('config.toml')), 'applyWiring includes config.toml result')
    const parsed = JSON.parse(readFileSync(join(h, '.codex', 'auth.json'), 'utf8'))
    assert(parsed.OPENAI_API_KEY === 'sk-wire', 'applyWiring wrote key into auth.json')
  } finally {
    if (prevHome === undefined) delete process.env.HOME
    else process.env.HOME = prevHome
  }
}

if (failed > 0) {
  console.error(`\n${failed} codex-auth assertion(s) failed`)
  process.exit(1)
}
console.log('\nall codex-auth cases passed')
