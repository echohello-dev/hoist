import { afterEach, describe, expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const moduleUrl = new URL('../src/lib/harnesses.ts', import.meta.url).href
const homes: string[] = []
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'hoist-cli-discovery-'))
  homes.push(home)
  const bin = join(home, 'bin')
  const cacheFile = join(home, '.cache', 'hoist', 'discovery.json')
  const calls = join(home, 'calls')
  await mkdir(bin)
  await mkdir(dirname(cacheFile), { recursive: true })
  await writeFile(calls, '')

  async function executable(path: string, body: string) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    return path
  }

  async function tool(path: string, version: string) {
    return executable(path, `printf '%s\\n' ${quote(path)} >> ${quote(calls)}\nprintf '%s\\n' ${quote(version)}`)
  }

  async function cache(raw: unknown, ageMs = 0) {
    await writeFile(cacheFile, JSON.stringify(raw))
    const time = new Date(Date.now() - ageMs)
    await utimes(cacheFile, time, time)
  }

  // An isolated HOME/PATH prevents real harness or npm execution. An unexpected
  // npm fallback is visible in the calls log, even when it finds nothing.
  await executable(join(bin, 'npm'), `printf 'npm %s\\n' "$*" >> ${quote(calls)}\nprintf '%s\\n' ${quote(join(home, 'npm', 'node_modules'))}`)

  async function discover(expression = 'await discoverHarness(findHarness("claude-code"))') {
    const child = Bun.spawn([
      process.execPath, '-e',
      `import { discoverHarness, discoverAll, findHarness, installHarness } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(${expression}))`,
    ], {
      env: { ...process.env, HOME: home, PATH: bin },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ])
    expect(stderr).toBe('')
    expect(code).toBe(0)
    return JSON.parse(stdout)
  }

  return { home, bin, cacheFile, calls, executable, tool, cache, discover }
}

describe.skipIf(process.platform === 'win32')('CLI OpenCode discovery cache (isolated fixtures)', () => {
  test('fresh cache wins over PATH without running the cached binary or npm', async () => {
    const f = await fixture()
    const path = await f.tool(join(f.home, 'hidden', 'claude'), 'must not run')
    await f.tool(join(f.bin, 'claude'), 'PATH version')
    await f.cache({ 'claude-code': { path, version: 'cached 2.1.204' } })
    expect(await f.discover()).toMatchObject({ installed: true, path, version: 'cached 2.1.204' })
    expect(await readFile(f.calls, 'utf8')).toBe('')
  })

  test('discoverAll reads all plugin harness ids and normalises unknown versions', async () => {
    const f = await fixture()
    const raw: Record<string, { path: string; version: unknown }> = {}
    for (const [id, binary, version] of [
      ['claude-code', 'claude', 'cached claude'], ['opencode', 'opencode', null], ['codex', 'codex', 42],
    ] as const) {
      raw[id] = { path: await f.tool(join(f.home, 'hidden', binary), 'must not run'), version }
    }
    await f.cache(raw)
    const results = await f.discover('await discoverAll()')
    expect(results.map((h: { installed: boolean }) => h.installed)).toEqual([true, true, true])
    expect(results.map((h: { version: string | null }) => h.version)).toEqual(['cached claude', null, null])
    expect(await readFile(f.calls, 'utf8')).toBe('')
  })

  for (const scenario of ['absent', 'stale', 'malformed JSON', 'array', 'null', 'missing id', 'missing path', 'non-string path', 'deleted binary', 'non-executable binary']) {
    test(`${scenario} cache falls back to PATH and reads the live version`, async () => {
      const f = await fixture()
      const live = await f.tool(join(f.bin, 'claude'), 'live 3.0')
      const cached = await f.tool(join(f.home, 'hidden', 'claude'), 'must not run')
      switch (scenario) {
        case 'stale': await f.cache({ 'claude-code': { path: cached, version: 'old' } }, 5 * 60 * 1000 + 1000); break
        case 'malformed JSON': await writeFile(f.cacheFile, '{'); break
        case 'array': await f.cache([]); break
        case 'null': await f.cache(null); break
        case 'missing id': await f.cache({ codex: { path: cached } }); break
        case 'missing path': await f.cache({ 'claude-code': { version: 'old' } }); break
        case 'non-string path': await f.cache({ 'claude-code': { path: 42 } }); break
        case 'deleted binary': await f.cache({ 'claude-code': { path: join(f.home, 'gone') } }); break
        case 'non-executable binary':
          await chmod(cached, 0o644)
          await f.cache({ 'claude-code': { path: cached } })
          break
      }
      expect(await f.discover()).toMatchObject({ installed: true, path: live, version: 'live 3.0' })
      expect(await readFile(f.calls, 'utf8')).toBe(`${live}\n`)
    })
  }

  test('absent cache preserves npm-global discovery when PATH misses', async () => {
    const f = await fixture()
    const path = await f.tool(join(f.home, 'npm', 'bin', 'claude'), 'npm-global 3.0')
    expect(await f.discover()).toMatchObject({ installed: true, path, version: 'npm-global 3.0' })
    expect(await readFile(f.calls, 'utf8')).toBe(`npm root -g\n${path}\n`)
  })

  test('absent cache and missing binary keep the not-installed result', async () => {
    const f = await fixture()
    expect(await f.discover()).toMatchObject({ installed: false, path: null, version: null })
  })

  for (const prefer of ['npm', 'brew']) {
    test(`${prefer} install bypasses a fresh cache to report the installed version`, async () => {
      const f = await fixture()
      const live = await f.tool(join(f.bin, 'claude'), 'new 4.0')
      const cached = await f.tool(join(f.home, 'hidden', 'claude'), 'must not run')
      await f.cache({ 'claude-code': { path: cached, version: 'old 2.0' } })
      if (prefer === 'brew') {
        await f.executable(join(f.bin, 'brew'), `printf 'brew %s\\n' "$*" >> ${quote(f.calls)}\nexit 0`)
      }
      expect(await f.discover(`await installHarness(findHarness("claude-code"), { prefer: "${prefer}" })`))
        .toMatchObject({ installed: true, path: live, version: 'new 4.0' })
      const calls = await readFile(f.calls, 'utf8')
      expect(calls).toContain(prefer === 'npm' ? 'npm install -g @anthropic-ai/claude-code' : 'brew upgrade claude-code')
      expect(calls).toContain(live)
      expect(calls).not.toContain(cached)
    })
  }
})
