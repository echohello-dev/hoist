import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import which from 'which'
import { HARNESS_CATALOG } from './providers/harnesses'
import { RUNTIME_CATALOG, type RuntimeCatalogEntry } from './providers/runtimes'

/**
 * Live Library discovery.
 *
 * - Harnesses (claude / opencode / codex) via `which -a` + config probes.
 * - Runtimes & package managers (node, bun, npm, python, go, rust, …).
 * - Multiple installs of the same tool, de-duped by realpath.
 * - Detects whether a JS harness was installed via npm, bun, pnpm, or Homebrew.
 */

const TIMEOUT_MS = 8000

export type LibraryKind = 'harness' | 'runtime' | 'package-manager'

/** How tightly this install is owned by Homebrew. */
export type HomebrewChannel =
  | 'formula' // $(brew --prefix)/Cellar/…
  | 'cask' // $(brew --prefix)/Caskroom/…
  | 'node' // npm -g into Homebrew's node prefix
  | null

export interface LibraryInstall {
  path: string
  realPath: string
  version: string | null
  source: string
  /** npm | bun | pnpm | yarn | homebrew | asdf | … when detectable. */
  packageManager: string | null
  /** Non-null when this install lives under the Homebrew prefix. */
  homebrew: HomebrewChannel
  primary: boolean
}

export interface LibraryEntry {
  id: string
  catalogId: string
  kind: LibraryKind
  name: string
  avatar: string
  status: 'installed' | 'installing' | 'available' | 'failed' | 'deprecated'
  exec: string | null
  version: string | null
  path: string | null
  source: string | null
  /** How this binary was installed / which PM owns it. */
  packageManager: string | null
  homebrew: HomebrewChannel
  primary: boolean
  installs: LibraryInstall[]
  config: {
    activeModel: string | null
    provider: string | null
    authStatus: string | null
    installDir: string | null
    models: string[]
  }
  desc: string
}

function run(
  cmd: string,
  args: string[],
  opts: { timeout?: number } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    let timer: NodeJS.Timeout | undefined
    if (opts.timeout) {
      timer = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error('timeout'))
      }, opts.timeout)
    }
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', (c: Buffer) => err.push(c))
    child.on('error', reject)
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        code: code ?? -1,
      })
    })
  })
}

function isBrokenProbeOutput(raw: string): boolean {
  const s = raw.toLowerCase()
  return (
    s.includes('no version is set') ||
    s.includes('unable to locate a java runtime') ||
    s.includes('command not found') ||
    s.includes('not found') ||
    s.includes('error:') ||
    s.includes('please run `asdf')
  )
}

function cleanVersion(raw: string | null, name: string): string | null {
  if (!raw) return null
  let trimmed = raw.trim().split('\n')[0].trim()
  if (!trimmed || isBrokenProbeOutput(trimmed)) return null
  const suffix = `(${name})`
  if (trimmed.endsWith(suffix)) trimmed = trimmed.slice(0, -suffix.length).trim()
  trimmed = trimmed.replace(/^codex-cli\s+/i, '')
  trimmed = trimmed.replace(/^v(?=\d)/, '')
  trimmed = trimmed.replace(/^Python\s+/i, '')
  trimmed = trimmed.replace(/^deno\s+/i, '')
  trimmed = trimmed.replace(/\s+\(stable.*$/i, '') // deno 2.9.1 (stable, …)
  trimmed = trimmed.replace(/^go\s+version\s+go/i, '')
  trimmed = trimmed.replace(/^pip\s+/i, '')
  trimmed = trimmed.replace(/^ruby\s+/i, '')
  // Prefer leading semver-ish token (handles ruby 2.6.10p210 (…), deno extras)
  const lead = trimmed.match(/^(\d+\.\d+\.\d+\S*|\d+\.\d+\S*)/)
  if (lead && (/\s/.test(trimmed) || /p\d+/.test(lead[1]))) {
    // keep patch-level ruby builds like 2.6.10p210, drop trailing junk
    if (/\(/.test(trimmed)) trimmed = lead[1]
  }
  // pip long line → version only
  const pipVer = trimmed.match(/^(\d+\.\d+(?:\.\d+)?)/)
  if (pipVer && /from\s+\//i.test(trimmed)) trimmed = pipVer[1]
  // openjdk version "21.0.1" …
  const jver = trimmed.match(/version\s+"([^"]+)"/i)
  if (jver) trimmed = jver[1]
  return trimmed || null
}

function resolveReal(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** Cached `brew --prefix` (null when brew is missing). */
let brewPrefixCache: string | null | undefined

async function getBrewPrefix(): Promise<string | null> {
  if (brewPrefixCache !== undefined) return brewPrefixCache
  try {
    const r = await run('brew', ['--prefix'], { timeout: 3000 })
    if (r.code === 0) {
      const p = r.stdout.trim()
      brewPrefixCache = p || null
      return brewPrefixCache
    }
  } catch {
    // no brew
  }
  // Fallback to common prefixes when brew isn't on PATH but files exist
  for (const candidate of ['/opt/homebrew', '/usr/local']) {
    if (existsSync(join(candidate, 'Cellar')) || existsSync(join(candidate, 'Caskroom'))) {
      brewPrefixCache = candidate
      return brewPrefixCache
    }
  }
  brewPrefixCache = null
  return null
}

/**
 * Classify Homebrew ownership.
 * - formula: Cellar/… (brew install foo)
 * - cask:    Caskroom/… (brew install --cask foo)
 * - node:    under brew prefix node_modules (npm i -g using Homebrew Node)
 */
export function detectHomebrew(
  path: string,
  realPath: string,
  brewPrefix: string | null,
): HomebrewChannel {
  const hay = `${path}\n${realPath}`
  if (hay.includes('/Caskroom/')) return 'cask'
  if (hay.includes('/Cellar/')) return 'formula'
  if (brewPrefix) {
    const under =
      realPath === brewPrefix ||
      realPath.startsWith(`${brewPrefix}/`) ||
      path === brewPrefix ||
      path.startsWith(`${brewPrefix}/`)
    if (under) {
      if (hay.includes('node_modules') || hay.includes('npm-cli') || hay.includes('npx-cli')) {
        return 'node'
      }
      // brew's opt/ symlinks resolve into Cellar already; leftover prefix bins
      if (hay.includes(`${brewPrefix}/opt/`)) return 'formula'
    }
  }
  return null
}

export function sourceLabel(
  path: string,
  realPath: string,
  homebrew: HomebrewChannel,
): string {
  if (homebrew === 'formula') return 'Homebrew'
  if (homebrew === 'cask') return 'Homebrew Cask'
  if (homebrew === 'node') return 'npm · Homebrew Node'
  const p = `${path} ${realPath}`.toLowerCase()
  if (p.includes('.asdf')) return 'asdf'
  if (p.includes('.nvm') || p.includes('/nvm/')) return 'nvm'
  if (p.includes('.fnm') || p.includes('/fnm/')) return 'fnm'
  if (p.includes('.volta')) return 'Volta'
  if (p.includes('.bun/')) return 'Bun'
  if (p.includes('.opencode')) return 'OpenCode installer'
  if (p.includes('node_modules')) return 'npm'
  if (p.includes('.local/bin')) return 'local'
  if (p.includes('/usr/bin/') || p.includes('xcode.app')) return 'System'
  if (p.includes('/opt/homebrew/bin') || p.includes('/usr/local/bin')) return 'PATH'
  return basename(dirname(path)) || 'PATH'
}

/**
 * Infer which package manager (or channel) owns this binary install.
 */
export function detectPackageManager(
  path: string,
  realPath: string,
  homebrew: HomebrewChannel,
): string | null {
  if (homebrew === 'formula' || homebrew === 'cask') return 'homebrew'
  if (homebrew === 'node') return 'npm'
  const p = `${path} ${realPath}`.toLowerCase()
  if (p.includes('.bun/') || p.includes('/bun/bin') || /\/bun$/.test(realPath)) return 'bun'
  if (p.includes('/pnpm') || p.endsWith('pnpm')) return 'pnpm'
  if (p.includes('/yarn') || p.endsWith('yarn')) return 'yarn'
  if (p.includes('.asdf')) return 'asdf'
  if (p.includes('.nvm')) return 'nvm'
  if (p.includes('node_modules') || p.includes('npm-cli') || p.includes('npx-cli')) return 'npm'
  if (p.includes('.opencode')) return 'opencode'
  if (p.includes('pip') || p.includes('site-packages')) return 'pip'
  if (p.includes('cargo') || p.includes('.rustup') || p.includes('.cargo')) return 'cargo'
  return null
}

async function findAllBinaries(binary: string): Promise<string[]> {
  try {
    const r = await run('which', ['-a', binary], { timeout: 3000 })
    if (r.code === 0) {
      const hits = r.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('which:'))
      if (hits.length > 0) return [...new Set(hits)]
    }
  } catch {
    // fall through
  }
  try {
    const p = await which(binary)
    return p ? [p] : []
  } catch {
    return []
  }
}

async function tryReadJson(path: string): Promise<unknown | null> {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

async function readClaudeState(binaryPath: string): Promise<LibraryEntry['config']> {
  const env = process.env
  const fromEnv = {
    activeModel: env.COPILOT_MODEL || env.ANTHROPIC_MODEL || null,
    provider: env.COPILOT_PROVIDER_TYPE || env.ANTHROPIC_BASE_URL || null,
  }
  let authStatus: string | null = null
  try {
    const r = await run(binaryPath, ['auth', 'status'], { timeout: TIMEOUT_MS })
    if (r.code === 0) {
      try {
        const j = JSON.parse(r.stdout) as {
          loggedIn?: boolean
          subscriptionType?: string
          email?: string
        }
        authStatus = j.loggedIn
          ? `${j.subscriptionType ?? 'logged in'} (${j.email ?? '—'})`
          : 'not logged in'
      } catch {
        authStatus = r.stdout.split('\n')[0].trim() || null
      }
    } else {
      authStatus = 'auth unavailable'
    }
  } catch {
    authStatus = null
  }
  const settings = (await tryReadJson(join(homedir(), '.claude', 'settings.json'))) as
    | { model?: string; activeModel?: string; installDir?: string }
    | null
  let activeModel = fromEnv.activeModel
  if (!activeModel && settings?.model) activeModel = settings.model
  else if (!activeModel && settings?.activeModel) activeModel = settings.activeModel
  return {
    activeModel,
    provider: fromEnv.provider,
    authStatus,
    installDir: typeof settings?.installDir === 'string' ? settings.installDir : null,
    models: [],
  }
}

async function readOpencodeState(binary: string): Promise<LibraryEntry['config']> {
  let models: string[] = []
  try {
    const r = await run(binary, ['models'], { timeout: TIMEOUT_MS })
    if (r.code === 0) {
      models = r.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('Available'))
        .slice(0, 24)
    }
  } catch {
    // ignore
  }
  const cfg = (await tryReadJson(join(homedir(), '.config', 'opencode', 'opencode.json'))) as
    | { provider?: Record<string, { name?: string; models?: Record<string, unknown> }> }
    | null
  let activeModel: string | null = null
  let providerName: string | null = null
  let firstProviderName: string | null = null
  if (cfg?.provider) {
    for (const [id, p] of Object.entries(cfg.provider)) {
      if (firstProviderName === null && p.name) firstProviderName = p.name
      for (const modelId of Object.keys(p.models || {})) {
        if (activeModel === null) {
          activeModel = modelId
          providerName = p.name ?? id
        }
      }
    }
  }
  return {
    activeModel,
    provider: providerName ?? firstProviderName,
    authStatus: 'opencode.config',
    installDir: null,
    models,
  }
}

async function readCodexState(): Promise<LibraryEntry['config']> {
  const cfg = (await tryReadJson(join(homedir(), '.codex', 'config.json'))) as
    | { model?: string; provider?: string; providers?: Record<string, { models?: unknown }> }
    | null
  const parsedToml: { model?: string; provider?: string } = {}
  try {
    const raw = readFileSync(join(homedir(), '.codex', 'config.toml'), 'utf8')
    for (const key of ['model', 'provider'] as const) {
      const m = raw.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, 'm'))
      if (m) parsedToml[key] = m[1].trim()
    }
  } catch {
    // ignore
  }
  const activeModel = parsedToml.model ?? cfg?.model ?? null
  const provider = parsedToml.provider ?? cfg?.provider ?? null
  const modelsAll: string[] = []
  if (cfg?.providers) {
    for (const p of Object.values(cfg.providers)) {
      if (p && Array.isArray(p.models)) {
        for (const m of p.models) if (typeof m === 'string') modelsAll.push(m)
      }
    }
  }
  return {
    activeModel,
    provider,
    authStatus: existsSync(join(homedir(), '.codex', 'auth.json')) ? 'auth.json present' : 'codex.config',
    installDir: join(homedir(), '.codex'),
    models: activeModel ? [activeModel, ...modelsAll.filter((m) => m !== activeModel)] : modelsAll,
  }
}

async function probeVersion(
  path: string,
  displayName: string,
  versionArgs: string[],
): Promise<string | null> {
  try {
    const r = await run(path, versionArgs, { timeout: TIMEOUT_MS })
    // java -version writes to stderr
    const raw = (r.stdout || r.stderr || '').split('\n')[0] || null
    if (r.code === 0 || raw) return cleanVersion(raw, displayName)
  } catch {
    // ignore
  }
  return null
}

async function collectInstalls(
  binaries: string[],
  displayName: string,
  versionArgs: string[] = ['--version'],
): Promise<LibraryInstall[]> {
  const brewPrefix = await getBrewPrefix()
  const pathHits: string[] = []
  for (const b of binaries) {
    const hits = await findAllBinaries(b)
    for (const h of hits) pathHits.push(h)
  }

  const installs: LibraryInstall[] = []
  const seenReal = new Set<string>()
  for (const p of pathHits) {
    const realPath = resolveReal(p)
    if (seenReal.has(realPath)) continue
    seenReal.add(realPath)
    const version = await probeVersion(p, displayName, versionArgs)
    // Drop asdf/nvm shims (and macOS Java stubs) that don't resolve to a real tool.
    if (!version) continue
    const homebrew = detectHomebrew(p, realPath, brewPrefix)
    installs.push({
      path: p,
      realPath,
      version,
      homebrew,
      source: sourceLabel(p, realPath, homebrew),
      packageManager: detectPackageManager(p, realPath, homebrew),
      primary: installs.length === 0,
    })
  }
  // Recompute primary after filtering
  installs.forEach((inst, i) => { inst.primary = i === 0 })
  return installs
}

function emptyConfig(authStatus: string): LibraryEntry['config'] {
  return {
    activeModel: null,
    provider: null,
    authStatus,
    installDir: null,
    models: [],
  }
}

function entriesFromInstalls(
  base: {
    catalogId: string
    kind: LibraryKind
    name: string
    avatar: string
    desc: string
  },
  installs: LibraryInstall[],
  config: LibraryEntry['config'],
): LibraryEntry[] {
  if (installs.length === 0) {
    return [{
      id: base.catalogId,
      catalogId: base.catalogId,
      kind: base.kind,
      name: base.name,
      avatar: base.avatar,
      status: 'available',
      exec: null,
      version: null,
      path: null,
      source: null,
      packageManager: null,
      homebrew: null,
      primary: true,
      installs: [],
      config,
      desc: base.desc,
    }]
  }

  const multi = installs.length > 1
  return installs.map((inst, i) => ({
    id: multi ? `${base.catalogId}#${i + 1}` : base.catalogId,
    catalogId: base.catalogId,
    kind: base.kind,
    name: base.name,
    avatar: base.avatar,
    status: 'installed' as const,
    exec: inst.path,
    version: inst.version,
    path: inst.path,
    source: inst.source,
    packageManager: inst.packageManager,
    homebrew: inst.homebrew,
    primary: inst.primary,
    installs,
    config,
    desc: base.desc,
  }))
}

async function discoverHarnesses(): Promise<LibraryEntry[]> {
  const out: LibraryEntry[] = []
  for (const entry of HARNESS_CATALOG) {
    const binary =
      entry.installMethods[0]?.type === 'npm'
        ? (entry.installMethods[0] as { binary?: string }).binary ?? entry.id
        : entry.id

    const installs = await collectInstalls([binary], entry.name, ['--version'])

    let config = emptyConfig(installs.length ? 'binary not configured' : 'binary not on PATH')
    if (installs.length > 0) {
      try {
        const primaryPath = installs[0].path
        if (entry.id === 'claude-code') config = await readClaudeState(primaryPath)
        else if (entry.id === 'opencode') config = await readOpencodeState(primaryPath)
        else if (entry.id === 'codex') config = await readCodexState()
      } catch {
        // keep defaults
      }
    }

    out.push(...entriesFromInstalls(
      {
        catalogId: entry.id,
        kind: 'harness',
        name: entry.name,
        avatar: entry.avatar,
        desc: entry.description,
      },
      installs,
      config,
    ))
  }
  return out
}

async function discoverRuntimes(): Promise<LibraryEntry[]> {
  const out: LibraryEntry[] = []
  for (const entry of RUNTIME_CATALOG) {
    const installs = await collectInstalls(
      entry.binaries,
      entry.name,
      entry.versionArgs ?? ['--version'],
    )

    // For package-manager entries, the tool IS the package manager.
    // Homebrew formula/cask → channel homebrew; Homebrew's bundled npm → still npm.
    const enriched = installs.map((inst) => ({
      ...inst,
      packageManager:
        entry.kind === 'package-manager'
          ? (inst.homebrew === 'formula' || inst.homebrew === 'cask'
              ? 'homebrew'
              : (inst.packageManager ?? entry.id))
          : inst.packageManager,
    }))

    const config = emptyConfig(
      enriched.length > 0
        ? (enriched[0].packageManager ? `via ${enriched[0].packageManager}` : enriched[0].source)
        : 'binary not on PATH',
    )

    out.push(...entriesFromInstalls(
      {
        catalogId: entry.id,
        kind: entry.kind,
        name: entry.name,
        avatar: entry.avatar,
        desc: entry.description,
      },
      enriched,
      config,
    ))
  }
  return out
}

/**
 * Detect which JS package managers are present and which is PATH-primary.
 * Surfaced on harness rows as a hint, and as its own library entries.
 */
export async function detectJsPackageManagers(): Promise<{
  installed: string[]
  primary: string | null
}> {
  const candidates = ['bun', 'pnpm', 'yarn', 'npm'] as const
  const installed: string[] = []
  let primary: string | null = null
  for (const pm of candidates) {
    const hits = await findAllBinaries(pm)
    if (hits.length > 0) {
      installed.push(pm)
      if (!primary) primary = pm
    }
  }
  // Prefer explicit ordering for "primary" when multiple are first-on-PATH
  // equal — use whichever appears first when resolving a dummy; already PATH order
  // via which -a first hit of each, then pick by common preference bun > pnpm > yarn > npm
  // only if we want preference over PATH. Stick to PATH order of first found above.
  return { installed, primary }
}

export async function libraryDiscover(): Promise<LibraryEntry[]> {
  const [harnesses, runtimes] = await Promise.all([
    discoverHarnesses(),
    discoverRuntimes(),
  ])

  // Annotate harness installs with a clearer packageManager when missing.
  // (detectPackageManager already covers most cases via path.)
  return [...harnesses, ...runtimes]
}

// Re-export for tests / IPC helpers
export type { RuntimeCatalogEntry }
