import { homedir } from 'node:os'
import { join } from 'node:path'
import { readJsonOrNull, writeJsonAtomic } from '../fsutil'

export function openCodeConfigPath(): string {
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'opencode', 'opencode.json')
}

export interface OpenCodeWiring {
  /** Provider ID in OpenCode config; defaults to "anthropic". */
  providerId: string
  /** SDK adapter to use. Defaults to `@ai-sdk/anthropic` for anthropic, `@ai-sdk/openai-compatible` otherwise. */
  adapter: '@ai-sdk/anthropic' | '@ai-sdk/openai-compatible' | string
  baseUrl: string
  apiKey: string
  modelId: string
}

export async function applyOpenCodeWiring(
  wiring: OpenCodeWiring,
): Promise<{ path: string; changed: boolean }> {
  const path = openCodeConfigPath()
  const existing = (await readJsonOrNull(path)) as Record<string, unknown> | null
  const next = { ...(existing ?? {}) }

  const providers = ((next.provider as Record<string, Record<string, unknown>> | undefined) ?? {})
  providers[wiring.providerId] = {
    npm: wiring.adapter,
    name: wiring.providerId,
    options: {
      baseURL: wiring.baseUrl,
      apiKey: wiring.apiKey,
    },
    models: {
      [wiring.modelId]: { name: wiring.modelId },
    },
  }
  next.provider = providers
  next.model = `${wiring.providerId}/${wiring.modelId}`

  await writeJsonAtomic(path, next)
  return { path, changed: true }
}

export async function clearOpenCodeProvider(providerId: string): Promise<{ path: string; changed: boolean }> {
  const path = openCodeConfigPath()
  const existing = (await readJsonOrNull(path)) as Record<string, unknown> | null
  if (!existing) return { path, changed: false }
  const providers = (existing.provider as Record<string, unknown> | undefined) ?? {}
  if (!(providerId in providers)) return { path, changed: false }
  delete providers[providerId]
  existing.provider = providers
  await writeJsonAtomic(path, existing)
  return { path, changed: true }
}
