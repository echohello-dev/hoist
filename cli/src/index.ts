import { Command } from 'commander'
import * as p from '@clack/prompts'
import {
  discoverAll,
  findHarness,
  installHarness,
} from './lib/harnesses'
import {
  deleteSecret,
  getSecret,
  listSecrets,
  maskSecret,
  secretIdFor,
  setSecret,
} from './lib/vault'
import { PROVIDER_CATALOG, findProvider } from './lib/providers'
import { probeProvider } from './lib/probes'
import { readConfig, writeConfig } from './lib/vault'

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
      const input = await p.password({ message: `Paste ${provider.envKeys[0]}:`, mask: '*' })
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
      const result = await probeProvider(provider, value, provider.defaultBaseUrl)
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

program
  .command('gateway')
  .description('Manage AI gateway routing.')
  .argument('[action]', 'show | set | clear', 'show')
  .argument('[baseUrl]', 'Gateway base URL')
  .action(async (action: string, baseUrl?: string) => {
    const config = await readConfig()
    if (action === 'show') {
      if (!config.gateway?.baseUrl) {
        console.log('No gateway configured.')
        return
      }
      console.log(`${config.gateway.provider ?? 'default'}: ${config.gateway.baseUrl}`)
      return
    }
    if (action === 'set') {
      if (!baseUrl) {
        console.log('Usage: hoist gateway set <baseUrl>')
        process.exit(1)
      }
      config.gateway = { baseUrl, provider: 'anthropic' }
      await writeConfig(config)
      console.log(`Gateway set: ${baseUrl}`)
      console.log(`To route Claude Code: export ANTHROPIC_BASE_URL=${baseUrl}`)
      return
    }
    if (action === 'clear') {
      delete config.gateway
      await writeConfig(config)
      console.log('Gateway cleared.')
      return
    }
  })

program
  .command('list')
  .description('Show providers and harnesses known to Hoist.')
  .action(async () => {
    console.log('\nHarnesses:')
    const harnesses = await discoverAll()
    for (const h of harnesses) {
      const status = h.installed ? `installed · ${h.version ?? 'unknown'}` : 'not installed'
      console.log(`  ${pad(h.spec.id, 14)}  ${pad(h.spec.name, 16)}  ${status}`)
    }
    console.log('\nProviders:')
    for (const provider of PROVIDER_CATALOG) {
      console.log(`  ${pad(provider.id, 12)}  ${provider.label}  (${provider.envKeys.join(', ')})`)
    }
  })

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Commander fontkit is not actually needed; removing import.

program.parseAsync(process.argv).catch((err) => {
  console.error(errMsg(err))
  process.exit(1)
})
