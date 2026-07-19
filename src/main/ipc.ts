import { clipboard } from 'electron'
import { ipcMain } from 'electron'
import { createSafeStorageBackend } from './secrets/safestorage'
import { maskSecret } from './secrets/backend'
import type { SecretBackend } from './secrets/backend'
import { runProbe } from './probes'
import { discoverAll, installHarness } from './installer'
import { HARNESS_CATALOG, findHarness } from './providers/harnesses'
import { PROVIDER_CATALOG, findProvider } from './providers/catalog'
import { applyWiring } from './wiring'
import { GATEWAY_CATALOG } from './gateways'
import { selectAnthropicEndpoint, selectOpenAIEndpoint, unresolvedPlaceholders } from './gateways/resolve'
import { CHANNELS } from '../shared/channels'
import type { InstalledTool } from '../shared/types'
import { claudeCodeSettingsPath } from './wiring/claudeCode'
import { codexConfigPath } from './wiring/codex'
import { openCodeConfigPath } from './wiring/openCode'
import { readFile } from 'node:fs/promises'

export { CHANNELS }

let primaryBackend: SecretBackend | null = null

function getBackend(): SecretBackend {
  if (!primaryBackend) {
    primaryBackend = createSafeStorageBackend()
  }
  return primaryBackend
}

interface VaultSetRequest {
  id: string
  value: string
  label?: string
}

interface ProbeRequest {
  providerId: string
  secretId?: string
  apiKey?: string
  baseUrl?: string
}

interface GatewayApplyRequest {
  gatewayId: string | null
  providerId: string
  baseUrl: string
  apiKey: string
  harnessIds: string[]
  label?: string
}

export function registerIpcHandlers(): void {
  ipcMain.handle(CHANNELS.vaultList, async () => {
    const backend = getBackend()
    const availability = await Promise.resolve(backend.availability())
    if (!availability.available) {
      return { ok: false as const, error: availability.reason ?? 'backend unavailable', entries: [] }
    }
    const entries = await backend.list()
    return { ok: true as const, entries }
  })

  ipcMain.handle(CHANNELS.vaultSet, async (_evt, req: VaultSetRequest) => {
    const backend = getBackend()
    if (!backend.set) {
      return { ok: false as const, error: 'backend is read-only' }
    }
    try {
      await backend.set(req.id, req.value, { label: req.label })
      return { ok: true as const, preview: maskSecret(req.value) }
    } catch (err) {
      return { ok: false as const, error: errMsg(err) }
    }
  })

  ipcMain.handle(CHANNELS.vaultDelete, async (_evt, id: string) => {
    const backend = getBackend()
    if (!backend.delete) {
      return { ok: false as const, error: 'backend is read-only' }
    }
    try {
      const removed = await backend.delete(id)
      return { ok: true as const, removed }
    } catch (err) {
      return { ok: false as const, error: errMsg(err) }
    }
  })

  ipcMain.handle(CHANNELS.vaultCopy, async (_evt, id: string) => {
    const backend = getBackend()
    const value = await backend.get(id)
    if (!value) return { ok: false as const, error: 'secret not found' }
    clipboard.writeText(value)
    setTimeout(() => {
      if (clipboard.readText() === value) {
        clipboard.clear()
      }
    }, 30_000)
    return { ok: true as const, clearedInMs: 30_000 }
  })

  ipcMain.handle(CHANNELS.harnessList, () => HARNESS_CATALOG)

  ipcMain.handle(CHANNELS.harnessDiscover, async () => {
    const installed = await discoverAll(HARNESS_CATALOG)
    return installed.reduce<Record<string, InstalledTool>>((acc, item) => {
      acc[item.spec.id] = item
      return acc
    }, {})
  })

  ipcMain.handle(CHANNELS.harnessInstall, async (_evt, id: string) => {
    const spec = findHarness(id)
    if (!spec) return { ok: false as const, error: `Unknown harness "${id}"` }
    try {
      const result = await installHarness(spec)
      return { ok: true as const, tool: result }
    } catch (err) {
      return { ok: false as const, error: errMsg(err) }
    }
  })

  ipcMain.handle(CHANNELS.harnessConfigShow, async (_evt, id: string) => {
    const spec = findHarness(id)
    if (!spec) return { ok: false as const, error: `Unknown harness "${id}"`, harnessId: id, exists: false }
    const cfg =
      id === 'claude-code'
        ? { path: claudeCodeSettingsPath(), editor: 'jsonEnv' as const }
        : id === 'codex'
          ? { path: codexConfigPath(), editor: 'toml' as const }
          : id === 'opencode'
            ? { path: openCodeConfigPath(), editor: 'jsonProvider' as const }
            : null
    if (!cfg) return { ok: false as const, harnessId: id, exists: false, error: 'No config editor for this harness' }
    let excerpt: string | undefined
    let exists = false
    try {
      const blob = await readFile(cfg.path, 'utf8')
      exists = true
      excerpt = blob.length > 1200 ? blob.slice(0, 1200) + '\n…' : blob
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    return {
      ok: true as const,
      harnessId: id,
      path: cfg.path,
      exists,
      excerpt,
      notes: [
        cfg.editor === 'jsonEnv' ? 'Hoist writes the `env` block; your other settings are preserved.' : '',
        cfg.editor === 'toml' ? 'Hoist writes a `[model_providers.<id>]` block; surrounding TOML is preserved.' : '',
        cfg.editor === 'jsonProvider' ? 'Hoist writes a `provider.<id>` block; existing providers are preserved.' : '',
      ].filter(Boolean),
    }
  })

  ipcMain.handle(CHANNELS.providerList, () => PROVIDER_CATALOG)

  ipcMain.handle(CHANNELS.gatewayList, () =>
    GATEWAY_CATALOG.map((g) => ({
      ...g,
      placeholders: unresolvedPlaceholders(g.baseUrl),
    })),
  )

  ipcMain.handle(CHANNELS.gatewayApply, async (_evt, req: GatewayApplyRequest) => {
    const placeholders = unresolvedPlaceholders(req.baseUrl)
    if (placeholders.length > 0) {
      return { ok: false as const, error: `Base URL still has placeholders: ${placeholders.map((p) => `<${p}>`).join(', ')}`, unresolvedPlaceholders: placeholders }
    }
    const provider = findProvider(req.providerId)
    if (!provider) {
      return { ok: false as const, error: `Unknown provider "${req.providerId}"` }
    }
    const gateway = req.gatewayId ? GATEWAY_CATALOG.find((g) => g.id === req.gatewayId) ?? null : null

    const effectiveBaseUrl = (() => {
      if (!gateway) return req.baseUrl.replace(/\/+$/, '')
      const anthropicEndpoint = selectAnthropicEndpoint(gateway, req.baseUrl)
      if (provider.probeKind === 'anthropicModels' && anthropicEndpoint) return anthropicEndpoint
      const openaiEndpoint = selectOpenAIEndpoint(gateway, req.baseUrl)
      return openaiEndpoint
    })()

    const harnesses = req.harnessIds
      .map((id) => findHarness(id))
      .filter((h): h is NonNullable<typeof h> => !!h)

    const wiring: { harnessId: string; harnessName: string; ok: boolean; error?: string; path?: string; note?: string; envHint?: Record<string, string> }[] = []

    for (const harness of harnesses) {
      try {
        const results = await applyWiring({
          apiKey: req.apiKey,
          baseUrl: effectiveBaseUrl,
          harness,
          provider,
          gateway,
        })
        for (const r of results) {
          wiring.push({
            harnessId: harness.id,
            harnessName: harness.name,
            ok: r.changed,
            path: r.path || undefined,
            note: r.note,
            envHint: r.envHint,
          })
        }
      } catch (err) {
        wiring.push({ harnessId: harness.id, harnessName: harness.name, ok: false, error: errMsg(err) })
      }
    }

    return { ok: true as const, wiring, effectiveBaseUrl }
  })

  ipcMain.handle(CHANNELS.probeRun, async (_evt, req: ProbeRequest) => {
    try {
      let apiKey = req.apiKey
      if (!apiKey && req.secretId) {
        apiKey = (await getBackend().get(req.secretId)) ?? undefined
      }
      if (!apiKey) {
        return { ok: false as const, error: 'No API key available for probe.' }
      }
      const result = await runProbe({ providerId: req.providerId, apiKey, baseUrl: req.baseUrl })
      return { ok: true as const, result }
    } catch (err) {
      return { ok: false as const, error: errMsg(err) }
    }
  })
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
