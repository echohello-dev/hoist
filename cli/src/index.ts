import { Command } from 'commander'
import * as p from '@clack/prompts'
import {
  discoverAll,
  findHarness,
  installHarness,
  HARNESS_CATALOG,
} from './lib/harnesses'
import {
  deleteSecret,
  getSecret,
  listSecrets,
  maskSecret,
  secretIdFor,
  setSecret,
} from './lib/vault'
import {
  findProvider,
  findGateway,
  GATEWAY_CATALOG,
  listGateways,
  selectAnthropicEndpoint,
  selectOpenAIEndpoint,
  unresolvedPlaceholders,
  type ProviderEntry,
} from './lib/providers'
import { probeAnthropic } from './lib/probes'
import { applyWiring, type WireResult } from './lib/wiring'

const VERSION = '0.0.0-dev'

const program = new Command()
program.name('hoist').description('Install agent harnesses. Manage your keys. Wire up your gateway.').version(VERSION)

program
  .command('install [harness]')
  .description('Install an agent harness (claude-code, opencode, codex). Omit to list discovered harnesses.')
  .action(async (id?: string) => {
    if (!id) {
      const all = await discoverAll()
      for (const h of all) {
        const status = h.installed ? `installed · ${h.version ?? 'unknown'}` : 'not installed'
        console.log(`${pad(h.spec.id, 14)}  ${pad(h.spec.name, 16)}  ${status}`)
      }
      return
    }
    const spec = findHarness(id)
    if (!spec) {
      p.cancel(`Unknown harness: ${id}`)
      process.exit(1)
    }
    const s = p.spinner()
    s.start(`Installing ${spec.name}…`)
    try {
      const result = await installHarness(spec)
      s.stop(`Installed ${spec.name}${result.version ? ` · ${result.version}` : ''}`)
    } catch (err) {
      s.stop(`Failed: ${errMsg(err)}`)
      process.exit(1)
    }
  })

program
  .command('keys')
  .description('Manage provider keys.')
  .argument('[action]', 'list | set | probe | delete', 'list')
  .argument('[providerId]', 'Provider id (e.g. anthropic)')
  .action(async (action: string, providerId?: string) => {
    if (action === 'list') {
      const entries = await listSecrets()
      if (entries.length === 0) {
        console.log('No keys stored. Run `hoist keys set <provider>`.')
        return
      }
      for (const entry of entries) {
        const value = await getSecret(entry.id).catch(() => null)
        console.log(`${pad(entry.id, 40)}  ${value ? maskSecret(value) : '••••'}  ${entry.updatedAt ?? ''}`)
      }
      return
    }
    if (action === 'set') {
      if (!providerId) {
        console.log('Usage: hoist keys set <provider>')
        process.exit(1)
      }
      const provider = findProvider(providerId)
      if (!provider) {
        console.log(`Unknown provider: ${providerId}`)
        process.exit(1)
      }
      const envKeys = provider.envKeys ?? []
      const input = await p.password({ message: `Paste ${envKeys[0] ?? 'token'}:`, mask: '*' })
      if (!input || p.isCancel(input)) {
        p.outro('Cancelled.')
        return
      }
      await setSecret(secretIdFor(provider.id), input, provider.label)
      p.outro(`Saved ${provider.label} key.`)
      return
    }
    if (action === 'probe') {
      if (!providerId) {
        console.log('Usage: hoist keys probe <provider>')
        process.exit(1)
      }
      const provider = findProvider(providerId)
      if (!provider) {
        console.log(`Unknown provider: ${providerId}`)
        process.exit(1)
      }
      const value = await getSecret(secretIdFor(provider.id))
      if (!value) {
        console.log(`No key stored for ${provider.id}. Run \`hoist keys set ${provider.id}\` first.`)
        process.exit(1)
      }
      const s = p.spinner()
      s.start(`Probing ${provider.label}…`)
      const result =
        provider.probeKind === 'anthropicModels'
          ? await probeAnthropic({ apiKey: value, baseUrl: provider.defaultBaseUrl ?? 'https://api.anthropic.com' })
          : {
              valid: false,
              status: 'error' as const,
              detail: `CLI probe for "${provider.id}" not implemented yet. Use the app's Validate button.`,
              checkedAt: new Date().toISOString(),
            }
      s.stop(`${result.valid ? '✓' : '✗'} ${result.status}${result.detail ? ` · ${result.detail}` : ''}`)
      process.exit(result.valid ? 0 : 1)
    }
    if (action === 'delete') {
      if (!providerId) {
        console.log('Usage: hoist keys delete <provider>')
        process.exit(1)
      }
      const provider = findProvider(providerId)
      const removed = await deleteSecret(secretIdFor(provider?.id ?? providerId))
      console.log(removed ? 'Deleted.' : 'No matching key.')
      return
    }
    console.log(`Unknown action: ${action}`)
  })

const gateway = program.command('gateway').description('Manage AI gateway routing & per-harness wiring.')

gateway
  .command('list')
  .description('List known AI gateways.')
  .action(() => {
    for (const g of listGateways()) {
      console.log(`${pad(g.id, 24)}  ${g.label}`)
      console.log(`${' '.repeat(24)}  base: ${g.baseUrl || '(custom)'}`)
      const ph = g.placeholders.length ? `placeholders: ${g.placeholders.join(', ')}` : null
      const ep = `endpoints: ${Object.entries(g.endpoints).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}`
      const auth = `auth: ${g.auth.header}${g.auth.scheme && g.auth.scheme !== 'raw' ? ` (${g.auth.scheme})` : ''} · env: ${g.auth.envVar}`
      console.log(`${' '.repeat(24)}  ${ep}`)
      console.log(`${' '.repeat(24)}  ${auth}`)
      if (ph) console.log(`${' '.repeat(24)}  ${ph}`)
      if (g.notes) console.log(`${' '.repeat(24)}  ${g.notes}`)
      console.log()
    }
  })

gateway
  .command('show')
  .description('Show current gateway configuration.')
  .action(() => {
    console.log('No gateway manager yet. Use `hoist gateway use <id>` to apply one.')
  })

gateway
  .command('use <gatewayId>')
  .description('Apply a gateway to the selected harnesses (writes Claude Code, Codex, OpenCode config).')
  .option('-p, --provider <id>', 'Provider id (default: anthropic)')
  .option('-u, --base-url <url>', 'Override the gateway base URL (placeholder-substitute)')
  .option('-k, --api-key <token>', 'API key (prompted if omitted)')
  .option('-H, --harness <ids>', 'Comma-separated harness ids (default: installed harnesses)', 'installed')
  .option('--dry-run', 'Print effective base URL & intended writes without touching files')
  .action(
    async (gatewayId: string, opts: { provider?: string; baseUrl?: string; apiKey?: string; harness?: string; dryRun?: boolean }) => {
      const gatewayEntry: import('./lib/providers').GatewayEntry | null =
        gatewayId === 'direct' ? null : findGateway(gatewayId) ?? null
      if (gatewayId !== 'direct' && !gatewayEntry) {
        console.log(`Unknown gateway: ${gatewayId}`)
        process.exit(1)
      }
      const provider: ProviderEntry | undefined = findProvider(opts.provider ?? 'anthropic')
      if (!provider) {
        console.log(`Unknown provider: ${opts.provider ?? 'anthropic'}`)
        process.exit(1)
      }

      const resolvedBaseUrl = opts.baseUrl ?? gatewayEntry?.baseUrl ?? provider.defaultBaseUrl ?? ''
      const placeholders = unresolvedPlaceholders(resolvedBaseUrl)
      if (placeholders.length > 0) {
        console.log(`Base URL still has placeholders: ${placeholders.map((p) => `<${p}>`).join(', ')}`)
        console.log(`Re-run with \`hoist gateway use ${gatewayId} --base-url <your-url>\`.`)
        process.exit(1)
      }

      const effectiveBaseUrl = (() => {
        if (!gatewayEntry) return resolvedBaseUrl.replace(/\/+$/, '')
        const anthropic = selectAnthropicEndpoint(gatewayEntry, resolvedBaseUrl)
        if (provider.probeKind === 'anthropicModels' && anthropic) return anthropic
        return selectOpenAIEndpoint(gatewayEntry, resolvedBaseUrl)
      })()

      const apiKey =
        opts.apiKey ??
        (await getSecret(secretIdFor(provider.id))) ??
        (await p.password({ message: `Paste ${provider.envKeys?.[0] ?? 'token'}:`, mask: '*' }))

      if (!apiKey || p.isCancel(apiKey)) {
        console.log('No API key.')
        process.exit(1)
      }
      // Persist into vault for next time.
      await setSecret(secretIdFor(provider.id), String(apiKey), provider.label)

      // Decide harnesses
      const harnessIds = opts.harness ?? 'installed'
      const harnesses: typeof HARNESS_CATALOG =
        harnessIds === 'installed'
          ? (await discoverAll()).filter((h) => h.installed).map((h) => h.spec)
          : harnessIds.split(',').map((id) => findHarness(id.trim())).filter((s): s is NonNullable<typeof s> => !!s)
      if (harnesses.length === 0) {
        console.log('No harnesses to apply wiring to.')
        return
      }

      console.log(`\n→ Effective base URL: ${effectiveBaseUrl}`)
      console.log(`→ Provider: ${provider.label} (${provider.id})`)
      console.log(`→ Gateway: ${gatewayEntry?.label ?? 'direct (no gateway)'}`)
      console.log(`→ Harnesses: ${harnesses.map((h) => h.id).join(', ')}\n`)
      if (opts.dryRun) {
        console.log('(dry-run, no files written)')
        return
      }

      const allResults: { harnessId: string; results: WireResult[] }[] = []
      for (const h of harnesses) {
        try {
          const results = await applyWiring({
            apiKey: String(apiKey),
            baseUrl: effectiveBaseUrl,
            harness: h,
            provider,
            gateway: gatewayEntry,
          })
          allResults.push({ harnessId: h.id, results })
        } catch (err) {
          console.log(`✗ ${h.name}: ${errMsg(err)}`)
        }
      }
      for (const { harnessId, results } of allResults) {
        for (const r of results) {
          console.log(`✓ ${harnessId}: ${r.path || '(no file)'}${r.note ? ` · ${r.note}` : ''}`)
        }
      }
    },
  )

const harness = program.command('harness').description('Inspect agent harness configuration.')

harness
  .command('list')
  .description('List known harnesses.')
  .action(() => {
    for (const h of HARNESS_CATALOG) {
      console.log(`${pad(h.id, 14)}  ${h.name}`)
    }
  })

harness
  .command('config [id]')
  .description('Show path + excerpt of a harness config file (claude-code | codex | opencode).')
  .action(async (id?: string) => {
    const ids = id ? [id] : HARNESS_CATALOG.map((h) => h.id)
    for (const x of ids) {
      const home = process.env.HOME ?? ''
      const path =
        x === 'claude-code'
          ? `${home}/.claude/settings.json`
          : x === 'codex'
            ? `${home}/.codex/config.toml`
            : x === 'opencode'
              ? `${process.env.XDG_CONFIG_HOME ?? `${home}/.config`}/opencode/opencode.json`
              : '?'
      console.log(`\n— ${x}`)
      console.log(`  ${path}`)
      try {
        const { readFile } = await import('node:fs/promises')
        const blob = await readFile(path, 'utf8')
        const truncated = blob.length > 600 ? blob.slice(0, 600) + '\n…(truncated)' : blob
        console.log('  ---')
        console.log(truncated.split('\n').map((line) => '  ' + line).join('\n'))
      } catch (err) {
        const msg = (err as NodeJS.ErrnoException).code === 'ENOENT' ? '(not found)' : String((err as Error).message ?? err)
        console.log(`  ${msg}`)
      }
    }
  })

program
  .command('list')
  .description('Show providers, gateways and harnesses known to Hoist.')
  .action(async () => {
    const harnesses = await discoverAll()
    console.log('\nHarnesses:')
    for (const h of harnesses) {
      const status = h.installed ? `installed · ${h.version ?? 'unknown'}` : 'not installed'
      console.log(`  ${pad(h.spec.id, 14)}  ${pad(h.spec.name, 16)}  ${status}`)
    }
    console.log('\nProviders:')
    for (const p of (await import('./lib/providers')).PROVIDER_CATALOG) {
      console.log(`  ${pad(p.id, 16)}  ${p.label}  (${(p.envKeys ?? []).join(', ') || 'cloud creds'})`)
    }
    console.log('\nGateways:')
    for (const g of GATEWAY_CATALOG) {
      console.log(`  ${pad(g.id, 24)}  ${g.label}  ${g.baseUrl || '(custom)'}`)
    }
  })

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

program.parseAsync(process.argv).catch((err) => {
  console.error(errMsg(err))
  process.exit(1)
})
