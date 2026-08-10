/**
 * Fetch available versions + changelog snippets for harness packages.
 * Prefers npm registry (full history) and GitHub CHANGELOG.md for notes.
 */
import { spawn } from 'node:child_process'
import { findHarnessCatalog } from '../providers/harnesses'

const TIMEOUT_MS = 15_000

export interface VersionInfo {
  version: string
  publishedAt?: string
  latest?: boolean
}

export interface ChangelogEntry {
  version: string
  body: string
}

export interface VersionCheckResult {
  ok: boolean
  error?: string
  harnessId: string
  packageName: string | null
  current: string | null
  latest: string | null
  outdated: boolean
  versions: VersionInfo[]
  /** Changelog sections between current → latest (or selected range). */
  changelog: ChangelogEntry[]
  /** Compare URL when a GitHub repo is known. */
  compareUrl: string | null
  homepage: string | null
}

const GITHUB_CHANGELOG: Record<string, string> = {
  'claude-code': 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md',
  // opencode / codex may not have public changelogs in the same place
}

const GITHUB_REPO: Record<string, string> = {
  'claude-code': 'anthropics/claude-code',
  opencode: 'anomalyco/opencode',
  codex: 'openai/codex',
}

function run(cmd: string, args: string[], timeout = TIMEOUT_MS): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('timeout'))
    }, timeout)
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', () => { /* ignore */ })
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout: Buffer.concat(out).toString('utf8'), code: code ?? -1 })
    })
  })
}

function npmPackageFor(harnessId: string): string | null {
  const spec = findHarnessCatalog(harnessId)
  const m = spec?.installMethods.find((x) => x.type === 'npm')
  return m && m.type === 'npm' ? m.package : null
}

function parseSemver(v: string): number[] | null {
  const m = v.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return a.localeCompare(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

/** Parse GitHub-style CHANGELOG.md into version → body map. */
export function parseChangelogMarkdown(md: string): Map<string, string> {
  const map = new Map<string, string>()
  const parts = md.split(/^##\s+/m).slice(1)
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const header = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body = (nl === -1 ? '' : part.slice(nl + 1)).trim()
    const ver = header.replace(/^v/, '').split(/\s+/)[0]
    if (/^\d+\.\d+/.test(ver)) map.set(ver, body)
  }
  return map
}

/** Changelog entries for versions (from, to] ordered newest-first. */
export function changelogBetween(
  map: Map<string, string>,
  from: string | null,
  to: string | null,
): ChangelogEntry[] {
  const entries = [...map.entries()]
    .map(([version, body]) => ({ version, body }))
    .sort((a, b) => compareVersions(b.version, a.version))

  if (!to && !from) return entries.slice(0, 5)

  const out: ChangelogEntry[] = []
  for (const e of entries) {
    if (to && compareVersions(e.version, to) > 0) continue
    if (from && compareVersions(e.version, from) <= 0) break
    out.push(e)
    if (out.length >= 12) break
  }
  return out
}

async function fetchNpmMeta(pkg: string): Promise<{
  latest: string
  versions: VersionInfo[]
  homepage: string | null
} | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg).replace('%40', '@')}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      'dist-tags'?: { latest?: string }
      versions?: Record<string, unknown>
      time?: Record<string, string>
      homepage?: string
    }
    const latest = data['dist-tags']?.latest ?? null
    if (!latest || !data.versions) return null
    const times = data.time ?? {}
    const versions = Object.keys(data.versions)
      .filter((v) => parseSemver(v))
      .sort((a, b) => compareVersions(b, a))
      .slice(0, 40)
      .map((version) => ({
        version,
        publishedAt: times[version],
        latest: version === latest,
      }))
    return { latest, versions, homepage: data.homepage ?? null }
  } catch {
    return null
  }
}

async function fetchChangelogMd(url: string): Promise<Map<string, string>> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return new Map()
    return parseChangelogMarkdown(await res.text())
  } catch {
    return new Map()
  }
}

async function brewCaskLatest(token: string): Promise<string | null> {
  try {
    const r = await run('brew', ['info', '--json=v2', '--cask', token], 12_000)
    if (r.code !== 0) return null
    const j = JSON.parse(r.stdout) as { casks?: Array<{ version?: string }> }
    return j.casks?.[0]?.version ?? null
  } catch {
    return null
  }
}

export async function checkHarnessVersions(
  harnessId: string,
  currentVersion: string | null,
): Promise<VersionCheckResult> {
  const catalogId = harnessId.includes('#') ? harnessId.split('#')[0] : harnessId
  const pkg = npmPackageFor(catalogId)
  const base: VersionCheckResult = {
    ok: false,
    harnessId: catalogId,
    packageName: pkg,
    current: currentVersion,
    latest: null,
    outdated: false,
    versions: [],
    changelog: [],
    compareUrl: null,
    homepage: null,
  }

  if (!pkg) {
    // Try brew-only latest
    if (catalogId === 'claude-code') {
      const latest = await brewCaskLatest('claude-code')
      if (latest) {
        return {
          ...base,
          ok: true,
          latest,
          outdated: currentVersion ? compareVersions(currentVersion, latest) < 0 : true,
          versions: [{ version: latest, latest: true }],
          homepage: 'https://claude.com/product/claude-code',
        }
      }
    }
    return { ...base, error: 'No version source for this harness' }
  }

  const meta = await fetchNpmMeta(pkg)
  if (!meta) return { ...base, error: `Could not fetch npm metadata for ${pkg}` }

  const changelogUrl = GITHUB_CHANGELOG[catalogId]
  const map = changelogUrl ? await fetchChangelogMd(changelogUrl) : new Map()
  const changelog = changelogBetween(map, currentVersion, meta.latest)

  const repo = GITHUB_REPO[catalogId]
  const compareUrl =
    repo && currentVersion && meta.latest && currentVersion !== meta.latest
      ? `https://github.com/${repo}/compare/v${currentVersion}...v${meta.latest}`
      : repo
        ? `https://github.com/${repo}`
        : null

  // Prefer brew cask latest when higher/different for claude-code display note
  let latest = meta.latest
  if (catalogId === 'claude-code') {
    const brewLatest = await brewCaskLatest('claude-code')
    if (brewLatest && compareVersions(brewLatest, latest) > 0) latest = brewLatest
  }

  return {
    ok: true,
    harnessId: catalogId,
    packageName: pkg,
    current: currentVersion,
    latest,
    outdated: currentVersion ? compareVersions(currentVersion, latest) < 0 : Boolean(latest),
    versions: meta.versions,
    changelog,
    compareUrl,
    homepage: meta.homepage,
  }
}

/** Changelog for an arbitrary version range (for UI version selector). */
export async function changelogForRange(
  harnessId: string,
  from: string | null,
  to: string | null,
): Promise<ChangelogEntry[]> {
  const catalogId = harnessId.includes('#') ? harnessId.split('#')[0] : harnessId
  const url = GITHUB_CHANGELOG[catalogId]
  if (!url) return []
  const map = await fetchChangelogMd(url)
  return changelogBetween(map, from, to)
}
