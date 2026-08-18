import { clipboard } from 'electron'
import { ipcMain } from 'electron'
import { createSafeStorageBackend } from './secrets/safestorage'
import { maskSecret } from './secrets/backend'
import type { SecretBackend } from './secrets/backend'
import { runProbe } from './probes'
import { runHarnessUsage, runProviderUsage } from './usage'
import { libraryDiscover } from './library'
import { discoverAll, installHarness, uninstallHarness } from './installer'
import { changelogForRange, checkHarnessVersions } from './installer/versions'
import { HARNESS_CATALOG, findHarness } from './providers/harnesses'
import { PROVIDER_CATALOG, findProvider } from './providers/catalog'
import { applyWiring } from './wiring'
import { modelPresetsFor, resetHarnessConfig, setHarnessModel } from './wiring/configure'
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

type UsageRequest =
  | { source: 'harness'; harnessId: string }
  | { source: 'provider'; providerId: string; secretId?: string }

interface GatewayApplyRequest {
  gatewayId: string | null
  providerId: string
  baseUrl: string
  /** Plaintext key — prefer secretId so the renderer never holds the secret. */
  apiKey?: string
  secretId?: string
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

  ipcMain.handle(CHANNELS.libraryList, () => libraryDiscover())

  ipcMain.handle(CHANNELS.harnessDiscover, async () => {
    const installed = await discoverAll(HARNESS_CATALOG)
    return installed.reduce<Record<string, InstalledTool>>((acc, item) => {
      acc[item.spec.id] = item
      return acc
    }, {})
  })

  ipcMain.handle(CHANNELS.harnessInstall, async (_evt, req: string | { id: string; version?: string; prefer?: 'npm' | 'brew'; force?: boolean }) => {
    const id = typeof req === 'string' ? req : req.id
    const catalogId = id.includes('#') ? id.split('#')[0] : id
    const spec = findHarness(catalogId)
    if (!spec) return { ok: false as const, error: `Unknown harness "${id}"` }
    try {
      const opts = typeof req === 'string' ? {} : { version: req.version, prefer: req.prefer, force: req.force }
      const result = await installHarness(spec, undefined, opts)
      return { ok: true as const, tool: result }
    } catch (err) {
      return { ok: false as const, error: errMsg(err) }
    }
  })

  ipcMain.handle(CHANNELS.harnessUninstall, async (_evt, req: { id: string; prefer?: 'npm' | 'brew' }) => {
    const catalogId = req.id.includes('#') ? req.id.split('#')[0] : req.id
    const spec = findHarness(catalogId)
    if (!spec) return { ok: false as const, error: `Unknown harness "${req.id}"` }
    try {
      return await uninstallHarness(spec, { prefer: req.prefer })
    } catch (err) {
      return { ok: false as const, message: errMsg(err) }
    }
  })

  ipcMain.handle(CHANNELS.harnessVersions, async (_evt, req: { id: string; current?: string | null; from?: string | null; to?: string | null }) => {
    const catalogId = req.id.includes('#') ? req.id.split('#')[0] : req.id
    try {
      const check = await checkHarnessVersions(catalogId, req.current ?? null)
      if (req.from || req.to) {
        check.changelog = await changelogForRange(catalogId, req.from ?? null, req.to ?? req.current ?? null)
      }
      return check
    } catch (err) {
      return {
        ok: false as const,
        error: errMsg(err),
        harnessId: catalogId,
        packageName: null,
        current: req.current ?? null,
        latest: null,
        outdated: false,
        versions: [],
        changelog: [],
        compareUrl: null,
        homepage: null,
      }
    }
  })

  ipcMain.handle(CHANNELS.harnessConfigShow, async (_evt, id: string) => {
    const catalogId = id.includes('#') ? id.split('#')[0] : id
    const spec = findHarness(catalogId)
    if (!spec) return { ok: false as const, error: `Unknown harness "${id}"`, harnessId: id, exists: false }
    const cfg =
      catalogId === 'claude-code'
        ? { path: claudeCodeSettingsPath(), editor: 'jsonEnv' as const }
        : catalogId === 'codex'
          ? { path: codexConfigPath(), editor: 'toml' as const }
          : catalogId === 'opencode'
            ? { path: openCodeConfigPath(), editor: 'jsonProvider' as const }
            : null
    if (!cfg) return { ok: false as const, harnessId: id, exists: false, error: 'No config editor for this harness' }
    let excerpt: string | undefined
    let exists = false
    let activeModel: string | null = null
    try {
      const blob = await readFile(cfg.path, 'utf8')
      exists = true
      excerpt = blob.length > 1200 ? blob.slice(0, 1200) + '\n…' : blob
      if (cfg.editor === 'jsonEnv' || cfg.editor === 'jsonProvider') {
        try {
          const j = JSON.parse(blob) as { model?: string }
          activeModel = typeof j.model === 'string' ? j.model : null
        } catch { /* ignore */ }
      } else if (cfg.editor === 'toml') {
        const m = blob.match(/^model\s*=\s*"?([^"\n]+)"?/m)
        activeModel = m?.[1]?.trim() ?? null
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    return {
      ok: true as const,
      harnessId: catalogId,
      path: cfg.path,
      exists,
      excerpt,
      activeModel,
      modelPresets: modelPresetsFor(catalogId),
      notes: [
        cfg.editor === 'jsonEnv' ? 'Hoist writes the `env` block and optional `model`; your other settings are preserved.' : '',
        cfg.editor === 'toml' ? 'Hoist writes a `[model_providers.<id>]` block and `model =`; surrounding TOML is preserved.' : '',
        cfg.editor === 'jsonProvider' ? 'Hoist writes a `provider.<id>` block and `model`; existing providers are preserved.' : '',
      ].filter(Boolean),
    }
  })

  ipcMain.handle(CHANNELS.harnessConfigSet, async (_evt, req: { harnessId: string; model?: string | null }) => {
    const harnessId = req.harnessId.includes('#') ? req.harnessId.split('#')[0] : req.harnessId
    return setHarnessModel({ harnessId, model: req.model })
  })

  ipcMain.handle(CHANNELS.harnessConfigReset, async (_evt, req: { harnessId: string; clearModel?: boolean }) => {
    const harnessId = req.harnessId.includes('#') ? req.harnessId.split('#')[0] : req.harnessId
    return resetHarnessConfig({ harnessId, clearModel: req.clearModel })
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

    let apiKey = req.apiKey
    if (!apiKey && req.secretId) {
      apiKey = (await getBackend().get(req.secretId)) ?? undefined
    }
    if (!apiKey) {
      return { ok: false as const, error: 'No API key available. Save a key in Provider keys first, or pass apiKey.' }
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

    if (harnesses.length === 0) {
      return { ok: false as const, error: 'Select at least one harness to wire.' }
    }

    const wiring: { harnessId: string; harnessName: string; ok: boolean; error?: string; path?: string; note?: string; envHint?: Record<string, string> }[] = []

    for (const harness of harnesses) {
      try {
        const results = await applyWiring({
          apiKey,
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

    const anyOk = wiring.some((w) => w.ok)
    return {
      ok: anyOk,
      error: anyOk ? undefined : 'Wiring failed for all selected harnesses.',
      wiring,
      effectiveBaseUrl,
    }
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

  ipcMain.handle(CHANNELS.usageRun, async (_evt, req: UsageRequest) => {
    try {
      if (req.source === 'harness') {
        const result = await runHarnessUsage(req.harnessId)
        return { ok: true as const, result }
      }
      let apiKey: string | undefined
      if (req.secretId) {
        apiKey = (await getBackend().get(req.secretId)) ?? undefined
      }
      if (!apiKey) {
        return { ok: false as const, error: 'No API key available for usage lookup.' }
      }
      const result = await runProviderUsage(req.providerId, apiKey)
      return { ok: true as const, result }
    } catch (err) {
      return { ok: false as const, error: errMsg(err) }
    }
  })

  ipcMain.handle(CHANNELS.clipboardRead, () => {
    try {
      const text = clipboard.readText().trim()
      // Truncate to keep IPC payloads bounded — suggestion is short anyway.
      const truncated = text.length > 4096 ? text.slice(0, 4096) : text
      return { ok: true as const, text: truncated }
    } catch (err) {
      return { ok: false as const, error: errMsg(err) }
    }
  })
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
