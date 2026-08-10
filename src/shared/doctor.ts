/**
 * Doctor — conflict analysis over Library discovery results.
 *
 * Pure functions so the renderer (and tests) can run without IPC.
 */

export type DoctorSeverity = 'error' | 'warn' | 'info' | 'ok'

export interface DoctorResolution {
  label: string
  /** Shell snippet the user can copy/run. */
  command?: string
  note?: string
}

export interface DoctorFinding {
  id: string
  severity: DoctorSeverity
  category: 'path-shadow' | 'channel-mix' | 'version-skew' | 'package-manager' | 'missing' | 'healthy'
  title: string
  detail: string
  catalogId?: string
  kind?: string
  installs?: Array<{
    path: string
    version: string | null
    source: string
    primary: boolean
    homebrew: string | null
    packageManager: string | null
  }>
  resolutions: DoctorResolution[]
}

export interface DoctorReport {
  findings: DoctorFinding[]
  summary: { error: number; warn: number; info: number; ok: number }
}

type LibLike = {
  id: string
  catalogId: string
  kind: string
  name: string
  status: string
  version: string | null
  path: string | null
  source: string | null
  packageManager: string | null
  homebrew: 'formula' | 'cask' | 'node' | null
  primary: boolean
  installs: Array<{
    path: string
    realPath: string
    version: string | null
    source: string
    packageManager: string | null
    homebrew: 'formula' | 'cask' | 'node' | null
    primary: boolean
  }>
}

function uniqVersions(installs: LibLike['installs']): string[] {
  return [...new Set(installs.map((i) => i.version).filter((v): v is string => Boolean(v)))]
}

function uniqChannels(installs: LibLike['installs']): string[] {
  return [...new Set(installs.map((i) => {
    if (i.homebrew === 'formula') return 'Homebrew formula'
    if (i.homebrew === 'cask') return 'Homebrew Cask'
    if (i.homebrew === 'node') return 'npm · Homebrew Node'
    return i.source || i.packageManager || 'other'
  }))]
}

function shellQuote(path: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(path)) return path
  return `'${path.replace(/'/g, `'\\''`)}'`
}

function resolutionsForShadow(name: string, catalogId: string, installs: LibLike['installs']): DoctorResolution[] {
  const primary = installs.find((i) => i.primary) ?? installs[0]
  const others = installs.filter((i) => i !== primary)
  const res: DoctorResolution[] = []

  res.push({
    label: `Keep PATH primary (${primary.source}${primary.version ? ` ${primary.version}` : ''})`,
    note: `Bare \`${catalogId === 'claude-code' ? 'claude' : catalogId}\` currently resolves to ${primary.path}`,
  })

  for (const o of others) {
    if (o.homebrew === 'cask') {
      res.push({
        label: `Remove Homebrew Cask copy (${o.version ?? 'unknown'})`,
        command: `brew uninstall --cask ${catalogId === 'claude-code' ? 'claude-code' : catalogId}`,
      })
    } else if (o.homebrew === 'formula') {
      const formula = catalogId === 'node' ? 'node' : catalogId === 'python' ? 'python@3.14' : catalogId
      res.push({
        label: `Remove Homebrew formula copy (${o.version ?? 'unknown'})`,
        command: `brew uninstall ${formula}`,
      })
    } else if (o.source === 'asdf' || o.packageManager === 'asdf') {
      res.push({
        label: `Remove asdf shim / version (${o.version ?? 'unknown'})`,
        command: o.version
          ? `asdf uninstall ${catalogId === 'claude-code' ? 'claude' : catalogId} ${o.version}`
          : `asdf list ${catalogId === 'claude-code' ? 'claude' : catalogId}`,
        note: 'Then run `asdf reshim` and open a new shell.',
      })
    } else if (o.packageManager === 'npm' || o.homebrew === 'node') {
      res.push({
        label: `Remove npm global copy`,
        command: `npm uninstall -g ${catalogId === 'claude-code' ? '@anthropic-ai/claude-code' : catalogId === 'opencode' ? 'opencode-ai' : catalogId === 'codex' ? '@openai/codex' : catalogId}`,
      })
    } else if (o.packageManager === 'bun') {
      res.push({
        label: `Remove Bun global copy`,
        command: `bun remove -g ${catalogId}`,
      })
    } else {
      res.push({
        label: `Move or rename non-primary binary`,
        command: `ls -la ${shellQuote(o.path)}`,
        note: `Consider removing ${o.path} from PATH or uninstalling via ${o.source}.`,
      })
    }
  }

  res.push({
    label: 'Refresh shell command cache',
    command: 'hash -r',
    note: 'Or open a new terminal tab so PATH order is re-read.',
  })

  return res
}

/**
 * Build a doctor report from discovered library entries.
 * Uses primary rows only when grouping by catalogId (installs[] already lists siblings).
 */
export function analyzeLibrary(entries: LibLike[]): DoctorReport {
  const findings: DoctorFinding[] = []

  // One representative per catalog family (prefer primary installed row)
  const byCatalog = new Map<string, LibLike>()
  for (const e of entries) {
    const prev = byCatalog.get(e.catalogId)
    if (!prev) {
      byCatalog.set(e.catalogId, e)
      continue
    }
    // Prefer installed primary
    if (e.status === 'installed' && e.primary) byCatalog.set(e.catalogId, e)
    else if (e.status === 'installed' && prev.status !== 'installed') byCatalog.set(e.catalogId, e)
  }

  for (const e of byCatalog.values()) {
    if (e.status !== 'installed' || e.installs.length === 0) continue

    const installs = e.installs
    const versions = uniqVersions(installs)
    const channels = uniqChannels(installs)

    if (installs.length > 1) {
      const versionSkew = versions.length > 1
      findings.push({
        id: `shadow:${e.catalogId}`,
        severity: versionSkew ? 'error' : 'warn',
        category: versionSkew ? 'version-skew' : 'path-shadow',
        title: versionSkew
          ? `${e.name} has ${installs.length} installs on different versions`
          : `${e.name} is installed ${installs.length} times on PATH`,
        detail: versionSkew
          ? `PATH primary is ${installs.find((i) => i.primary)?.version ?? 'unknown'} at ${installs.find((i) => i.primary)?.path ?? '—'}. Other copies: ${versions.filter((v) => v !== installs.find((i) => i.primary)?.version).join(', ')}. Shells may pick different binaries depending on PATH order.`
          : `Multiple PATH hits resolve to different files (or shims). Primary: ${installs.find((i) => i.primary)?.path ?? '—'}.`,
        catalogId: e.catalogId,
        kind: e.kind,
        installs: installs.map((i) => ({
          path: i.path,
          version: i.version,
          source: i.source,
          primary: i.primary,
          homebrew: i.homebrew,
          packageManager: i.packageManager,
        })),
        resolutions: resolutionsForShadow(e.name, e.catalogId, installs),
      })

      if (channels.length > 1) {
        findings.push({
          id: `channel:${e.catalogId}`,
          severity: 'warn',
          category: 'channel-mix',
          title: `${e.name} mixes install channels`,
          detail: `Found via: ${channels.join(', ')}. Pick one channel (usually Homebrew *or* asdf *or* npm) so upgrades stay coherent.`,
          catalogId: e.catalogId,
          kind: e.kind,
          installs: installs.map((i) => ({
            path: i.path,
            version: i.version,
            source: i.source,
            primary: i.primary,
            homebrew: i.homebrew,
            packageManager: i.packageManager,
          })),
          resolutions: [
            {
              label: 'Standardize on Homebrew (example)',
              command: channels.some((c) => c.startsWith('Homebrew'))
                ? '# keep brew copy, remove the others (see PATH shadow finding)'
                : `brew install ${e.catalogId === 'claude-code' ? '--cask claude-code' : e.catalogId}`,
            },
            {
              label: 'Or standardize on asdf',
              note: 'Install via asdf plugin, then remove Homebrew/npm copies.',
            },
          ],
        })
      }
    }
  }

  // JS package manager proliferation
  const pms = [...byCatalog.values()].filter(
    (e) => e.kind === 'package-manager' && ['npm', 'bun', 'pnpm', 'yarn'].includes(e.catalogId) && e.status === 'installed',
  )
  if (pms.length > 1) {
    const primaryPm = pms.find((p) => p.primary) ?? pms[0]
    // Determine PATH order among JS PMs by which has primary install first - use first in list order from discovery
    const names = pms.map((p) => `${p.name}${p.version ? ` ${p.version}` : ''}${p.homebrew ? ` (${p.homebrew === 'node' ? 'Homebrew Node' : 'Homebrew'})` : p.source ? ` (${p.source})` : ''}`)
    findings.push({
      id: 'pm:multiple',
      severity: 'info',
      category: 'package-manager',
      title: `${pms.length} JavaScript package managers installed`,
      detail: `Detected ${names.join(', ')}. Projects may resolve different tools depending on lockfiles and PATH. PATH-facing primary among discovered PMs is roughly ${primaryPm.name}.`,
      resolutions: [
        {
          label: 'Prefer one PM per project',
          note: 'Commit a single lockfile (package-lock.json, bun.lockb, pnpm-lock.yaml, or yarn.lock).',
        },
        {
          label: 'See which PM wins on PATH',
          command: 'which -a bun pnpm yarn npm',
        },
        {
          label: 'Check this repo’s lockfile',
          command: 'ls package-lock.json bun.lockb pnpm-lock.yaml yarn.lock 2>/dev/null',
        },
      ],
    })
  }

  // Node multi-version without calling it out twice if shadow already exists
  const node = byCatalog.get('node')
  if (node && node.installs.length > 1 && !findings.some((f) => f.id === 'shadow:node')) {
    findings.push({
      id: 'node:versions',
      severity: 'warn',
      category: 'version-skew',
      title: 'Multiple Node.js versions on PATH',
      detail: `Versions: ${uniqVersions(node.installs).join(', ')}. Agent CLIs often bind to whichever node is first on PATH.`,
      catalogId: 'node',
      kind: 'runtime',
      installs: node.installs.map((i) => ({
        path: i.path,
        version: i.version,
        source: i.source,
        primary: i.primary,
        homebrew: i.homebrew,
        packageManager: i.packageManager,
      })),
      resolutions: resolutionsForShadow('Node.js', 'node', node.installs),
    })
  }

  // Missing recommended tools
  for (const id of ['node', 'npm'] as const) {
    const e = byCatalog.get(id)
    if (!e || e.status !== 'installed') {
      findings.push({
        id: `missing:${id}`,
        severity: 'warn',
        category: 'missing',
        title: `${id === 'node' ? 'Node.js' : 'npm'} is not available`,
        detail: 'Most agent harnesses expect a working Node toolchain for global CLIs.',
        catalogId: id,
        resolutions: [
          { label: 'Install via Homebrew', command: id === 'node' ? 'brew install node' : 'brew install node  # includes npm' },
          { label: 'Or use asdf', command: 'asdf plugin add nodejs && asdf install nodejs latest' },
        ],
      })
    }
  }

  // Healthy summary when few issues
  const problems = findings.filter((f) => f.severity === 'error' || f.severity === 'warn')
  if (problems.length === 0) {
    findings.unshift({
      id: 'healthy',
      severity: 'ok',
      category: 'healthy',
      title: 'No install conflicts detected',
      detail: 'Harnesses and runtimes look clean — single installs per tool, or matching versions.',
      resolutions: [
        { label: 'Re-run discovery anytime', note: 'Open Library and click Refresh, or revisit Doctor after installing tools.' },
      ],
    })
  }

  // Sort: error, warn, info, ok
  const order: Record<DoctorSeverity, number> = { error: 0, warn: 1, info: 2, ok: 3 }
  findings.sort((a, b) => order[a.severity] - order[b.severity])

  const summary = { error: 0, warn: 0, info: 0, ok: 0 }
  for (const f of findings) summary[f.severity] += 1

  return { findings, summary }
}
