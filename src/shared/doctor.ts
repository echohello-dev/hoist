/**
 * Doctor — conflict analysis over Library discovery results.
 *
 * Pure functions so the renderer (and tests) can run without IPC.
 */

export type DoctorSeverity = 'error' | 'warn' | 'info' | 'ok'

/** Machine-executable fix the Doctor UI can run (not just copy). */
export type DoctorAction =
  | { type: 'uninstall'; harnessId: string; prefer?: 'npm' | 'brew' }
  | { type: 'install'; harnessId: string; prefer?: 'npm' | 'brew'; force?: boolean; version?: string }
  | { type: 'upgrade'; harnessId: string; prefer?: 'npm' | 'brew' }
  | { type: 'reconfigure'; harnessId: string }
  | { type: 'navigate'; surface: 'library' | 'harnesses' | 'keys' | 'gateway' | 'doctor' | 'status' }

export interface DoctorResolution {
  label: string
  /** Shell snippet the user can copy/run. */
  command?: string
  note?: string
  /** If set, Doctor shows a Fix button that runs this action. */
  action?: DoctorAction
  /** Highlight as the recommended fix. */
  primary?: boolean
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

/** Binary name used on PATH for a catalog id. */
export function catalogBinaryName(catalogId: string): string {
  switch (catalogId) {
    case 'claude-code': return 'claude'
    case 'codex': return 'codex'
    case 'opencode': return 'opencode'
    case 'python': return 'python3'
    case 'pip': return 'pip3'
    case 'rust': return 'rustc'
    default: return catalogId
  }
}

function isHarnessId(catalogId: string): boolean {
  return catalogId === 'claude-code' || catalogId === 'opencode' || catalogId === 'codex'
}

function resolutionsForShadow(name: string, catalogId: string, installs: LibLike['installs']): DoctorResolution[] {
  const primary = installs.find((i) => i.primary) ?? installs[0]
  const others = installs.filter((i) => i !== primary)
  const res: DoctorResolution[] = []
  const harness = isHarnessId(catalogId)

  res.push({
    label: `Keep PATH primary (${primary.source}${primary.version ? ` ${primary.version}` : ''})`,
    note: `Bare \`${catalogBinaryName(catalogId)}\` resolves to ${primary.path}`,
    primary: true,
    action: harness ? { type: 'reconfigure', harnessId: catalogId } : undefined,
  })

  if (harness) {
    res.push({
      label: 'Upgrade PATH winner to latest',
      note: `Reinstall/upgrade the primary ${name} install via ${primary.homebrew ? 'Homebrew' : primary.packageManager === 'npm' || primary.homebrew === 'node' ? 'npm' : 'Homebrew'}.`,
      action: {
        type: 'upgrade',
        harnessId: catalogId,
        prefer: primary.homebrew ? 'brew' : 'npm',
      },
      primary: true,
    })
    res.push({
      label: 'Reconfigure models & wiring',
      note: 'Open Library configure for model selection and Hoist env reset.',
      action: { type: 'reconfigure', harnessId: catalogId },
    })
  }

  for (const o of others) {
    if (o.homebrew === 'cask') {
      res.push({
        label: `Remove Homebrew Cask copy (${o.version ?? 'unknown'})`,
        command: `brew uninstall --cask ${catalogId === 'claude-code' ? 'claude-code' : catalogId}`,
        action: harness ? { type: 'uninstall', harnessId: catalogId, prefer: 'brew' } : undefined,
      })
    } else if (o.homebrew === 'formula') {
      const formula = catalogId === 'node' ? 'node' : catalogId === 'python' ? 'python@3.14' : catalogId
      res.push({
        label: `Remove Homebrew formula copy (${o.version ?? 'unknown'})`,
        command: `brew uninstall ${formula}`,
        action: harness ? { type: 'uninstall', harnessId: catalogId, prefer: 'brew' } : undefined,
      })
    } else if (o.source === 'asdf' || o.packageManager === 'asdf') {
      res.push({
        label: `Remove asdf shim / version (${o.version ?? 'unknown'})`,
        command: o.version
          ? `asdf uninstall ${catalogBinaryName(catalogId)} ${o.version}`
          : `asdf list ${catalogBinaryName(catalogId)}`,
        note: 'Then run `asdf reshim` and open a new shell. Hoist cannot drive asdf directly.',
      })
    } else if (o.packageManager === 'npm' || o.homebrew === 'node') {
      res.push({
        label: 'Remove npm global copy',
        command: `npm uninstall -g ${catalogId === 'claude-code' ? '@anthropic-ai/claude-code' : catalogId === 'opencode' ? 'opencode-ai' : catalogId === 'codex' ? '@openai/codex' : catalogId}`,
        action: harness ? { type: 'uninstall', harnessId: catalogId, prefer: 'npm' } : undefined,
      })
    } else if (o.packageManager === 'bun') {
      res.push({
        label: 'Remove Bun global copy',
        command: `bun remove -g ${catalogId}`,
      })
    } else {
      res.push({
        label: 'Inspect non-primary binary',
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
      const primary = installs.find((i) => i.primary) ?? installs[0]
      // Multi-install is normal (asdf + brew, old + new). Surface as info/warn, not error.
      // Warn only when a harness has version skew (shell may not run the version you think).
      const severity: DoctorSeverity =
        versionSkew && e.kind === 'harness' ? 'warn' : 'info'
      findings.push({
        id: `shadow:${e.catalogId}`,
        severity,
        category: versionSkew ? 'version-skew' : 'path-shadow',
        title: versionSkew
          ? `${e.name}: PATH picks ${primary.version ?? 'unknown'} (${installs.length} installs)`
          : `${e.name}: ${installs.length} installs on PATH`,
        detail: versionSkew
          ? `When you run the bare command, PATH resolves to ${primary.path} (${primary.version ?? 'unknown'}, ${primary.source}). Other versions present: ${versions.filter((v) => v !== primary.version).join(', ')}. This is informational unless you expected a different binary.`
          : `Multiple PATH hits resolve to different files. Winner: ${primary.path}.`,
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
          severity: 'info',
          category: 'channel-mix',
          title: `${e.name} is installed via ${channels.length} channels`,
          detail: `Channels: ${channels.join(', ')}. Common and fine if intentional (e.g. brew for default, asdf for project pins). Only clean up if upgrades feel inconsistent.`,
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
              label: 'See PATH order',
              command: `which -a ${catalogBinaryName(e.catalogId)}`,
            },
            ...(isHarnessId(e.catalogId)
              ? [
                  {
                    label: 'Reconfigure in Library',
                    action: { type: 'reconfigure' as const, harnessId: e.catalogId },
                    primary: true,
                  },
                  {
                    label: 'Upgrade PATH winner',
                    action: {
                      type: 'upgrade' as const,
                      harnessId: e.catalogId,
                      prefer: (installs.find((i) => i.primary)?.homebrew ? 'brew' : 'npm') as 'brew' | 'npm',
                    },
                  },
                ]
              : [
                  {
                    label: 'Optional: standardize on one channel',
                    note: 'Keep the PATH winner; remove the other only if it confuses you.',
                  },
                ]),
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

  // Missing recommended tools — only when truly absent
  for (const id of ['node'] as const) {
    const e = byCatalog.get(id)
    if (!e || e.status !== 'installed') {
      findings.push({
        id: `missing:${id}`,
        severity: 'warn',
        category: 'missing',
        title: 'Node.js is not available',
        detail: 'Most agent harnesses expect a working Node toolchain for global CLIs.',
        catalogId: id,
        resolutions: [
          { label: 'Install via Homebrew', command: 'brew install node' },
          { label: 'Or use asdf', command: 'asdf plugin add nodejs && asdf install nodejs latest' },
        ],
      })
    }
  }

  // Healthy / calm summary — multi-install info alone is not "unhealthy"
  const problems = findings.filter((f) => f.severity === 'error' || f.severity === 'warn')
  if (problems.length === 0) {
    findings.unshift({
      id: 'healthy',
      severity: 'ok',
      category: 'healthy',
      title: problems.length === 0 && findings.length > 0
        ? 'No blocking issues'
        : 'No install conflicts detected',
      detail: findings.some((f) => f.severity === 'info')
        ? 'You have multiple installs on PATH (common with Homebrew + asdf). PATH order decides the winner — check the PATH priority panel on each harness.'
        : 'Harnesses and runtimes look clean — single installs per tool, or intentional multi-version setups.',
      resolutions: [
        { label: 'Inspect PATH winners', command: 'which -a claude opencode codex node npm bun' },
        { label: 'Re-run discovery anytime', note: 'Open Library → Refresh, or revisit Doctor after installing tools.' },
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
