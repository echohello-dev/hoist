import { clipboard } from 'electron'
import { ipcMain } from 'electron'
import { createSafeStorageBackend } from './secrets/safestorage'
import { maskSecret } from './secrets/backend'
import type { SecretBackend } from './secrets/backend'
import { runProbe } from './probes'
import { discoverAll, installHarness } from './installer'
import { HARNESS_CATALOG, findHarness } from './providers/harnesses'
import { PROVIDER_CATALOG } from './providers/catalog'
import { CHANNELS } from '../shared/channels'
import type { InstalledTool } from '../shared/types'

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

  ipcMain.handle(CHANNELS.providerList, () => PROVIDER_CATALOG)

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
