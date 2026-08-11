/**
 * Unit tests for install method coverage (script / download / brew / npm).
 * Exercises pure validation paths without running real package managers.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, writeFile, chmod, access, constants, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

// Build main first is assumed via `npm test`.
const installerPath = join(process.cwd(), 'dist/main/installer/index.js')
const { installHarness, uninstallHarness, userBinDirHint } = await import(pathToFileURL(installerPath).href)

let passed = 0
function ok(name, cond) {
  assert.ok(cond, name)
  console.log(`  ✓ ${name}`)
  passed++
}

console.log('install methods')

// --- script: reject bad exit ---
{
  let threw = false
  try {
    await installHarness(
      {
        id: 'fake-script',
        name: 'Fake Script',
        description: 'test',
        installMethods: [{ type: 'script', command: 'exit 42' }],
      },
      undefined,
      {},
    )
  } catch (err) {
    threw = true
    ok('script non-zero throws', String(err.message).includes('script install failed'))
  }
  ok('script non-zero did throw', threw)
}

// --- script: success path (no binary left, but method runs) ---
{
  const result = await installHarness(
    {
      id: 'echo-script',
      name: 'Echo Script',
      description: 'test',
      installMethods: [{ type: 'script', command: 'true' }],
    },
    undefined,
    {},
  )
  ok('script success returns discover result', result && result.spec.id === 'echo-script')
}

// --- download: reject non-http ---
{
  let threw = false
  try {
    await installHarness(
      {
        id: 'bad-dl',
        name: 'Bad DL',
        description: 'test',
        installMethods: [{ type: 'download', url: 'file:///etc/passwd' }],
      },
      undefined,
      {},
    )
  } catch (err) {
    threw = true
    ok('download rejects file://', String(err.message).includes('http'))
  }
  ok('download file:// threw', threw)
}

// --- download: reject invalid url ---
{
  let threw = false
  try {
    await installHarness(
      {
        id: 'bad-url',
        name: 'Bad URL',
        description: 'test',
        installMethods: [{ type: 'download', url: 'not a url' }],
      },
      undefined,
      {},
    )
  } catch (err) {
    threw = true
    ok('download rejects garbage url', String(err.message).includes('Invalid download URL'))
  }
  ok('download garbage threw', threw)
}

// --- download + uninstall via local http fixture ---
{
  const dir = await mkdtemp(join(tmpdir(), 'hoist-dl-'))
  const binPath = join(dir, 'payload.sh')
  await writeFile(binPath, '#!/bin/sh\necho 1.2.3\n', { mode: 0o755 })
  await chmod(binPath, 0o755)

  // Serve via a tiny node http server
  const { createServer } = await import('node:http')
  const { readFile } = await import('node:fs/promises')
  const server = createServer(async (_req, res) => {
    const body = await readFile(binPath)
    res.writeHead(200, { 'content-type': 'application/octet-stream' })
    res.end(body)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  const url = `http://127.0.0.1:${port}/payload.sh`

  const spec = {
    id: `hoist-test-dl-${Date.now()}`,
    name: 'DL Test',
    description: 'test',
    installMethods: [{ type: 'download', url }],
  }

  try {
    const installed = await installHarness(spec, undefined, {})
    ok('download install returns path under hoist bin', Boolean(installed.path && installed.path.includes('hoist')))
    const un = await uninstallHarness(spec, { prefer: 'download' })
    ok('download uninstall ok', un.ok === true)
  } finally {
    server.close()
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// --- uninstall script message ---
{
  const un = await uninstallHarness(
    {
      id: 'only-script',
      name: 'Only Script',
      description: 'test',
      installMethods: [{ type: 'script', command: 'true' }],
    },
    { prefer: 'script' },
  )
  ok('script uninstall explains manual removal', un.ok === false && un.message.includes('no automatic uninstall'))
}

ok('userBinDirHint is a path', typeof userBinDirHint() === 'string' && userBinDirHint().length > 0)

// silence unused
void require
void access
void constants

console.log(`\nall install method cases passed (${passed})`)
